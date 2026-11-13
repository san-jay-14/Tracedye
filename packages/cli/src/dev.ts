import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { findWorkspaceRoot } from "capture/root";
import { startCollector } from "collector/src/server";
import type { DevOptions } from "./args";
import { buildChildEnv, toShellCommand } from "./env";
import { checkProject } from "./project";

const require = createRequire(import.meta.url);
const log = (message: string) => console.log(`[dfd] ${message}`);

const fileUrl = (specifier: string) => pathToFileURL(require.resolve(specifier)).href;
const packageDir = (name: string) => path.dirname(require.resolve(`${name}/package.json`));

export async function dev(options: DevOptions): Promise<number> {
  const dir = path.resolve(options.dir);

  const check = checkProject({ dir, command: options.command, tsconfig: options.tsconfig, env: process.env, nodeVersion: process.version });
  for (const warning of check.warnings) log(`warning: ${warning}`);
  if (check.errors.length > 0) {
    for (const error of check.errors) console.error(`[dfd] error: ${error}`);
    return 1;
  }

  // Everything dfd stores lives in the project's .dfd/, which ignores itself.
  const dataDir = options.dataDir ? path.resolve(options.dataDir) : path.join(dir, ".dfd");
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(path.join(dataDir, ".gitignore"), "*\n");

  const collector = await startCollector({ port: options.port, dbPath: path.join(dataDir, "collector.db") }).catch((error) => {
    throw new Error(error?.code === "EADDRINUSE" ? `port ${options.port} is in use (is dfd already running here?). Use --port.` : String(error));
  });
  const collectorUrl = `http://localhost:${collector.port}`;
  log(`collector on ${collectorUrl}`);

  let dashboardUrl: string | undefined;
  let vite: import("vite").ViteDevServer | undefined;
  if (options.dashboard) {
    process.env.COLLECTOR_URL = collectorUrl; // read by the dashboard's vite.config.ts
    const { createServer } = await import("vite"); // only when the dashboard is wanted
    vite = await createServer({
      root: packageDir("dashboard"),
      server: { port: options.dashboardPort, strictPort: true },
      logLevel: "warn",
      clearScreen: false,
    }).catch((error) => {
      throw new Error(/in use/i.test(String(error)) ? `port ${options.dashboardPort} is in use. Use --dashboard-port.` : String(error));
    });
    await vite.listen();
    dashboardUrl = `http://localhost:${vite.config.server.port}`;
    log(`dashboard on ${dashboardUrl}`);
    if (options.open) openBrowser(dashboardUrl);
  }

  if (options.arm) {
    await fetch(`${collectorUrl}/triggers/${encodeURIComponent(options.arm)}/arm`, { method: "POST" });
    log(`armed "${options.arm}"`);
  }

  // Indexing can take minutes on a big repo and blocks while it runs, so it is its own process
  // and the map is pushed whenever it finishes.
  if (options.index) void indexAndPush(dir, options.tsconfig, collectorUrl);

  const env = buildChildEnv({
    base: process.env,
    collectorUrl,
    otel: options.otel,
    preloads: {
      start: pathToFileURL(path.join(import.meta.dirname, "preload", "start.mjs")).href,
      captureRegister: fileUrl("capture/register"),
      captureForward: fileUrl("capture/forward"),
      otel: pathToFileURL(path.join(import.meta.dirname, "preload", "otel.mjs")).href,
    },
  });

  log(`running: ${toShellCommand(options.command)}`);
  const child = spawn(toShellCommand(options.command), { cwd: dir, stdio: "inherit", shell: true, env });
  log(`ready${dashboardUrl ? `: open ${dashboardUrl}${options.arm ? "" : ", arm a trigger there, then use your app"}` : ""}`);

  const stop = async () => {
    killTree(child);
    await vite?.close();
    await collector.close();
  };
  process.once("SIGINT", () => void stop().then(() => process.exit(0)));
  process.once("SIGTERM", () => void stop().then(() => process.exit(0)));

  return new Promise<number>((resolve) => {
    child.on("exit", (code) => {
      log(`your command exited${code ? ` with code ${code}` : ""}`);
      void stop().then(() => resolve(code ?? 0));
    });
  });
}

async function indexAndPush(dir: string, tsconfig: string, collectorUrl: string): Promise<void> {
  const tsconfigPath = path.resolve(dir, tsconfig);
  const rootDir = findWorkspaceRoot(dir); // the same folder capture uses, so ids match
  const cli = path.join(packageDir("indexer"), "src", "cli.ts");
  const started = Date.now();
  log(`indexing ${path.relative(dir, tsconfigPath) || tsconfig} in the background...`);

  const child = spawn(process.execPath, [require.resolve("tsx/cli"), cli, tsconfigPath, rootDir], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=4096" },
  });
  const out: Buffer[] = [];
  const err: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
  const code = await new Promise<number | null>((resolve) => child.on("exit", resolve));

  const stderr = Buffer.concat(err).toString().trim();
  if (code !== 0) {
    log(`warning: indexing failed, so the dashboard will show runtime data only.\n${stderr.split("\n").slice(-3).join("\n")}`);
    return;
  }
  try {
    const response = await fetch(`${collectorUrl}/map`, { method: "POST", headers: { "content-type": "application/json" }, body: Buffer.concat(out) });
    log(response.ok ? `map ready (${stderr.split("\n").pop()}) [${((Date.now() - started) / 1000).toFixed(1)}s]` : `warning: collector rejected the map: ${response.status}`);
  } catch {
    log("warning: could not send the map to the collector");
  }
}

function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

function openBrowser(url: string): void {
  const [command, args] =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  spawn(command, args, { stdio: "ignore", detached: true }).on("error", () => log(`could not open a browser; go to ${url}`)).unref();
}
