// Proves the package works the way a stranger would use it: pack it, install the tarball into an
// empty folder with npm (so nothing comes from this repo), and run it on a small app.
// Needs the network for npm install. Usage: pnpm --filter tracedye verify
import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(here, "..");
const fixture = path.resolve(here, "../../cli/fixtures/app");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? "  ok " : " FAIL"}  ${what}`);
  if (!ok) failed++;
};
const run = (command, args, options) => spawnSync(command, args, { encoding: "utf8", shell: process.platform === "win32", ...options });

async function freePort() {
  return new Promise((resolve) => {
    const server = net.createServer().listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function until(what, fn, ms = 90_000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

const work = mkdtempSync(path.join(tmpdir(), "tracedye-verify-"));
let child;
try {
  console.log("1. build and pack");
  const build = run("node", [path.join(here, "build.mjs")], { cwd: pkgDir });
  check(build.status === 0, "build succeeds");
  const pack = run(npm, ["pack", "--json", "--pack-destination", work], { cwd: pkgDir });
  check(pack.status === 0, "npm pack succeeds");
  const [info] = JSON.parse(pack.stdout);
  const files = info.files.map((f) => f.path);
  check(files.includes("dist/cli.js") && files.includes("dist/dashboard/index.html") && files.includes("README.md") && files.includes("LICENSE"), "tarball has the command, the dashboard, README and LICENSE");
  check(!files.some((f) => /\.test\.|\.map$|node_modules|\.tracedye/.test(f)), "tarball has no tests, source maps or data");
  console.log(`   ${info.filename}: ${files.length} files, ${(info.size / 1024).toFixed(0)} KB packed, ${(info.unpackedSize / 1024).toFixed(0)} KB unpacked`);

  console.log("2. install the tarball into an empty project");
  const project = path.join(work, "project");
  mkdirSync(project);
  writeFileSync(path.join(project, "package.json"), JSON.stringify({ name: "verify-project", private: true, type: "module" }));
  const install = run(npm, ["install", "--no-audit", "--no-fund", path.join(work, info.filename), "tsx", "@types/node"], { cwd: project });
  check(install.status === 0, "npm install succeeds");
  if (install.status !== 0) console.log(install.stderr.split("\n").slice(-12).join("\n"));
  const installed = path.join(project, "node_modules", "tracedye");
  const cli = path.join(installed, "dist", "cli.js");
  const installedPkg = JSON.parse(readFileSync(path.join(installed, "package.json"), "utf8"));
  check(installedPkg.name === "tracedye" && installedPkg.bin?.tracedye === "./dist/cli.js", "installed package exposes the tracedye command");

  console.log("3. the command runs");
  const help = run("node", [cli, "help"], { cwd: project });
  check(help.status === 0 && /tracedye dev/.test(help.stdout), "tracedye help prints usage");
  const refuse = run("node", [cli, "dev", "--no-dashboard", "--", "echo", "hi"], { cwd: project, env: { ...process.env, NODE_ENV: "production" } });
  check(refuse.status === 1 && /production/.test(refuse.stderr), "refuses to run under NODE_ENV=production");

  console.log("4. trace a small app");
  const app = path.join(project, "app");
  cpSync(fixture, app, { recursive: true, filter: (src) => !src.includes(".tracedye") && !src.includes("node_modules") });
  const collectorPort = await freePort();
  const dashboardPort = await freePort();
  const appPort = await freePort();
  const tsxCli = path.join(project, "node_modules", "tsx", "dist", "cli.mjs");
  let output = "";
  child = spawn(
    "node",
    [cli, "dev", "--dir", app, "--port", String(collectorPort), "--dashboard-port", String(dashboardPort), "--data-dir", path.join(work, "data"), "--arm", "verify", "--", "node", tsxCli, "server.ts"],
    { cwd: project, env: { ...process.env, PORT: String(appPort) } },
  );
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));

  await until("the app and the map", () => output.includes(`fixture app on ${appPort}`) && output.includes("map ready"));
  check(true, "started the collector, the dashboard, the indexer and the app");
  check(/map ready \(indexed 1 files/.test(output), "the indexer built a map from the installed package");

  const dashboard = await fetch(`http://localhost:${dashboardPort}/`);
  check(dashboard.status === 200 && (await dashboard.text()).includes("<title>Tracedye</title>"), "the dashboard is served");
  const asset = /assets\/[^"]+\.js/.exec(await (await fetch(`http://localhost:${dashboardPort}/`)).text())?.[0];
  check(asset !== undefined && (await fetch(`http://localhost:${dashboardPort}/${asset}`)).status === 200, "the dashboard's script loads");
  check((await (await fetch(`http://localhost:${dashboardPort}/collector/state`)).json()).armed === "verify", "the dashboard reaches the collector");

  await new Promise((r) => setTimeout(r, 1500)); // the app follows the armed state by polling
  check((await (await fetch(`http://localhost:${appPort}/?name=Ann`)).text()) === "hello Ann", "the traced app still answers correctly");
  const triggers = await until("a stored trigger", async () => {
    const list = await (await fetch(`http://localhost:${collectorPort}/triggers`)).json();
    return list.length > 0 && list[0].events >= 7 ? list : undefined;
  });
  const events = await (await fetch(`http://localhost:${collectorPort}/triggers/${triggers[0].id}/events`)).json();
  const entered = events.filter((e) => e.phase === "enter").map((e) => e.nodeId.split(":")[1]);
  check(entered.join(",") === "respond,parseName,greet", `captured the request's function calls (${entered.join(" > ")})`);
} catch (error) {
  failed++;
  console.log(` FAIL  ${error.message}`);
} finally {
  if (child?.pid) {
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGTERM");
  }
  await new Promise((r) => setTimeout(r, 1500));
  try { rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch {}
}

console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
