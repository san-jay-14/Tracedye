import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { findWorkspaceRoot } from "capture/root";
import { startCollector } from "collector/src/server";
import type { DevOptions } from "./args";
import { startDashboard, type DashboardServer } from "./dashboard-server";
import { buildChildEnv, toShellCommand } from "./env";
import { locateRuntime, type Runtime } from "./paths";
import { checkProject } from "./project";

const log = (message: string) => console.log(`[tracedye] ${message}`);

export async function dev(options: DevOptions): Promise<number> {
  const dir = path.resolve(options.dir);
  const runtime = locateRuntime();

  const check = checkProject({ dir, command: options.command, tsconfig: options.tsconfig, env: process.env, nodeVersion: process.version });
  for (const warning of check.warnings) log(`warning: ${warning}`);
  if (check.errors.length > 0) {
    for (const error of check.errors) console.error(`[tracedye] error: ${error}`);
    return 1;
  }

  // Everything tracedye stores lives in the project's .tracedye/, which ignores itself.
  const dataDir = options.dataDir ? path.resolve(options.dataDir) : path.join(dir, ".tracedye");
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(path.join(dataDir, ".gitignore"), "*\n");

  const collector = await startCollector({ port: options.port, dbPath: path.join(dataDir, "collector.db") }).catch((error) => {
    throw new Error(error?.code === "EADDRINUSE" ? `port ${options.port} is in use (is tracedye already running here?). Use --port.` : String(error));
  });
  const collectorUrl = `http://localhost:${collector.port}`;
  log(`collector on ${collectorUrl}`);

  let dashboardUrl: string | undefined;
  let dashboard: DashboardServer | undefined;
  if (options.dashboard) {
    dashboard = await startDashboardFor(runtime, options.dashboardPort, collectorUrl).catch((error) => {
      throw new Error(error?.code === "EADDRINUSE" || /in use/i.test(String(error)) ? `port ${options.dashboardPort} is in use. Use --dashboard-port.` : String(error));
    });
    dashboardUrl = `http://localhost:${dashboard.port}`;
    log(`dashboard on ${dashboardUrl}`);
    if (options.open) openBrowser(dashboardUrl);
  }

  if (options.arm) {
    await fetch(`${collectorUrl}/triggers/${encodeURIComponent(options.arm)}/arm`, { method: "POST" });
    log(`armed "${options.arm}"`);
  }

  // Indexing can take minutes on a big repo and blocks while it runs, so it is its own process
  // and the map is pushed whenever it finishes.
  if (options.index) void indexAndPush(runtime, dir, options.tsconfig, collectorUrl);

  const env = buildChildEnv({ base: process.env, collectorUrl, otel: options.otel, preloads: runtime.preloads });

  log(`running: ${toShellCommand(options.command)}`);
  const child = spawn(toShellCommand(options.command), { cwd: dir, stdio: "inherit", shell: true, env });
  log(`ready${dashboardUrl ? `: open ${dashboardUrl}${options.arm ? "" : ", arm a trigger there, then use your app"}` : ""}`);

  const stop = async () => {
    killTree(child);
    await dashboard?.close();
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

// A built dashboard is served as files. Only a repo checkout that has not built it falls back to Vite.
async function startDashboardFor(runtime: Runtime, port: number, collectorUrl: string): Promise<DashboardServer> {
  if (runtime.dashboard.kind === "static") return startDashboard({ dir: runtime.dashboard.dir, port, collectorUrl });

  process.env.COLLECTOR_URL = collectorUrl; // read by the dashboard's vite.config.ts
  const { createServer } = await import("vite");
  const vite = await createServer({ root: runtime.dashboard.root, server: { port, strictPort: true }, logLevel: "warn", clearScreen: false });
  await vite.listen();
  return { port: vite.config.server.port as number, close: () => vite.close() };
}

async function indexAndPush(runtime: Runtime, dir: string, tsconfig: string, collectorUrl: string): Promise<void> {
  const tsconfigPath = path.resolve(dir, tsconfig);
  const rootDir = findWorkspaceRoot(dir); // the same folder capture uses, so ids match
  const started = Date.now();
  log(`indexing ${path.relative(dir, tsconfigPath) || tsconfig} in the background...`);

  const child = spawn(runtime.indexer.command, [...runtime.indexer.args, tsconfigPath, rootDir], {
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
