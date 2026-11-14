import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

// Runs the real `tracedye dev` on fixtures/app: collector, indexer, the app under tsx with capture preloaded.
const here = path.dirname(fileURLToPath(import.meta.url));
const bin = path.resolve(here, "../bin/tracedye.mjs");
const fixture = path.resolve(here, "../fixtures/app");
const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer().listen(0, () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
  });
}

// Each test keeps its data in its own folder, so one test's triggers never show up in another.
const dataDirs: string[] = [];
const running: ChildProcess[] = [];
afterEach(() => {
  for (const child of running.splice(0)) {
    if (child.pid === undefined) continue;
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGTERM");
  }
  // Best effort: the processes may still be letting go of the files.
  for (const dir of dataDirs.splice(0)) {
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch {}
  }
});

async function until<T>(what: string, check: () => Promise<T | undefined> | T | undefined, ms = 60_000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

async function startDfd(extraArgs: string[]) {
  const collectorPort = await freePort();
  const appPort = await freePort();
  const dataDir = mkdtempSync(path.join(tmpdir(), "tracedye-e2e-"));
  dataDirs.push(dataDir);
  const child = spawn(
    process.execPath,
    [bin, "dev", "--dir", fixture, "--port", String(collectorPort), "--no-dashboard", "--data-dir", dataDir, ...extraArgs, "--", process.execPath, tsxCli, "server.ts"],
    { env: { ...process.env, PORT: String(appPort) }, stdio: ["ignore", "pipe", "pipe"] },
  );
  running.push(child);
  let output = "";
  child.stdout?.on("data", (chunk) => (output += chunk));
  child.stderr?.on("data", (chunk) => (output += chunk));

  await until("the app and the map", () => (output.includes(`fixture app on ${appPort}`) && output.includes("map ready") ? true : undefined));
  const collector = `http://localhost:${collectorPort}`;
  return { dataDir, collector, app: `http://localhost:${appPort}`, output: () => output };
}

async function mapNodeIds(collector: string): Promise<string[]> {
  const socket = new WebSocket(`${collector.replace("http", "ws")}/stream`);
  const first = await new Promise<{ nodes: { id: string }[] }>((resolve) => {
    socket.on("message", (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === "map") resolve(message);
    });
  });
  socket.close();
  return first.nodes.map((n) => n.id);
}

describe("tracedye dev on a fixture app", () => {
  it("captures a request when armed, with ids that match the static map", async () => {
    const { collector, app } = await startDfd(["--arm", "e2e"]);
    // the app follows the collector's armed state by polling
    await until("the app to be armed", async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return true;
    });

    expect(await (await fetch(`${app}/?name=Ann`)).text()).toBe("hello Ann");

    const triggers = await until("a stored trigger", async () => {
      const list = (await (await fetch(`${collector}/triggers`)).json()) as { id: string; name: string; events: number }[];
      return list.length > 0 && list[0].events >= 7 ? list : undefined; // an http hop and enter and exit of three calls
    });
    expect(triggers[0].name).toBe("e2e");

    const events = (await (await fetch(`${collector}/triggers/${triggers[0].id}/events`)).json()) as { phase: string; nodeId: string; input?: unknown; target?: string }[];
    const entered = events.filter((e) => e.phase === "enter").map((e) => e.nodeId.split(":")[1]);
    expect(entered).toEqual(["respond", "parseName", "greet"]);
    expect(events.find((e) => e.phase === "hop")).toMatchObject({ target: "GET /" });

    // the same ids in the map and in the events, or nothing would line up in the dashboard
    const ids = await mapNodeIds(collector);
    for (const event of events.filter((e) => e.phase === "enter")) expect(ids).toContain(event.nodeId);
  }, 120_000);

  it("captures nothing while no trigger is armed", async () => {
    const { collector, app } = await startDfd([]);
    expect(await (await fetch(`${app}/?name=Bob`)).text()).toBe("hello Bob");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(await (await fetch(`${collector}/triggers`)).json()).toEqual([]);
  }, 120_000);

  it("keeps its data in the folder it is given, and that folder ignores itself", async () => {
    const { dataDir } = await startDfd([]);
    const { existsSync, readFileSync } = await import("node:fs");
    expect(existsSync(path.join(dataDir, "collector.db"))).toBe(true);
    expect(readFileSync(path.join(dataDir, ".gitignore"), "utf8").trim()).toBe("*");
  }, 120_000);

  it("refuses to run when NODE_ENV is production", () => {
    const result = spawnSync(process.execPath, [bin, "dev", "--dir", fixture, "--no-dashboard", "--", "echo", "hi"], {
      env: { ...process.env, NODE_ENV: "production" },
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/production/);
  }, 30_000);
});
