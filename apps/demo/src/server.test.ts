import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startCollector, type Collector } from "collector/src/server";
import type { DashboardServer } from "cli/src/dashboard-server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { allowedCollectorRequest, startDemoServer } from "./server";
import type { SimulateResult } from "./simulate";

let dir: string;
let collector: Collector;
let server: DashboardServer;
let base: string;
let nextResult: SimulateResult;
let simulateCalls: number;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "tracedye-demo-"));
  mkdirSync(path.join(dir, "assets"));
  writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>Tracedye</title>");
  collector = await startCollector({ port: 0, dbPath: ":memory:" });
  nextResult = { ok: true, triggerId: "user-login-1" };
  simulateCalls = 0;
  server = await startDemoServer({
    dashboardDir: dir,
    port: 0,
    collectorUrl: `http://localhost:${collector.port}`,
    simulator: { simulate: async () => (simulateCalls++, nextResult) },
  });
  base = `http://localhost:${server.port}`;
});

afterEach(async () => {
  await server.close();
  await collector.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("what a visitor can reach", () => {
  it.each([
    ["GET", "/state", true],
    ["GET", "/triggers", true],
    ["GET", "/triggers/user-login-1/events", true],
    ["GET", "/triggers/a/b/events", false],
    ["GET", "/triggers/user-login-1", false],
    ["POST", "/state", false],
    ["POST", "/events", false],
    ["POST", "/map", false],
    ["POST", "/v1/traces", false],
    ["POST", "/triggers/x/arm", false],
    ["POST", "/triggers/x/disarm", false],
    ["PUT", "/triggers", false],
    ["DELETE", "/triggers", false],
  ])("%s %s -> allowed: %s", (method, target, allowed) => {
    expect(allowedCollectorRequest(method, target)).toBe(allowed);
  });

  it("lets a visitor read from the collector", async () => {
    expect(await (await fetch(`${base}/collector/state`)).json()).toEqual({ armed: null });
    expect(await (await fetch(`${base}/collector/triggers`)).json()).toEqual([]);
    expect((await fetch(`${base}/collector/triggers/nope/events`)).status).toBe(404); // reached the collector, which has no such trigger
  });

  it("stops a visitor from writing to the collector, which never sees the request", async () => {
    for (const [method, target] of [
      ["POST", "/collector/events"],
      ["POST", "/collector/map"],
      ["POST", "/collector/v1/traces"],
      ["POST", "/collector/triggers/user%20login/arm"],
      ["POST", "/collector/triggers/user%20login/disarm"],
    ]) {
      const response = await fetch(`${base}${target}`, { method, headers: { "content-type": "application/json" }, body: "[]" });
      expect(response.status, `${method} ${target}`).toBe(403);
    }
    expect(await (await fetch(`${base}/collector/state`)).json()).toEqual({ armed: null });
    expect(await (await fetch(`${base}/collector/triggers`)).json()).toEqual([]);
  });

  it("serves the dashboard", async () => {
    expect(await (await fetch(base)).text()).toContain("<title>Tracedye</title>");
  });
});

describe("the demo routes", () => {
  it("tells the dashboard it is a demo", async () => {
    expect(await (await fetch(`${base}/demo/config`)).json()).toEqual({ simulate: true });
  });

  it("runs a simulated login on POST and passes the result back", async () => {
    const response = await fetch(`${base}/demo/simulate`, { method: "POST" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, triggerId: "user-login-1" });
    expect(simulateCalls).toBe(1);
  });

  it("passes a refusal through with its status, so the page can say what happened", async () => {
    nextResult = { ok: false, status: 429, error: "Please wait a moment between clicks." };
    const response = await fetch(`${base}/demo/simulate`, { method: "POST" });
    expect(response.status).toBe(429);
    expect(((await response.json()) as { error: string }).error).toMatch(/wait a moment/);
  });

  it("does nothing on GET", async () => {
    expect((await fetch(`${base}/demo/simulate`)).status).toBe(405);
    expect(simulateCalls).toBe(0);
  });

  it("ignores whatever a visitor sends in the body", async () => {
    await fetch(`${base}/demo/simulate`, { method: "POST", body: JSON.stringify({ email: "x@y.z", password: "p" }) });
    expect(simulateCalls).toBe(1);
  });
});
