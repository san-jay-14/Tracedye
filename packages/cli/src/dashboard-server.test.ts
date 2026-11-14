import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { startCollector, type Collector } from "collector/src/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { startDashboard, type DashboardServer } from "./dashboard-server";

let dir: string;
let collector: Collector;
let dashboard: DashboardServer;
let base: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "tracedye-dashboard-"));
  mkdirSync(path.join(dir, "assets"));
  writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>Tracedye</title>");
  writeFileSync(path.join(dir, "assets", "app.js"), "console.log(1)");
  writeFileSync(path.join(dir, "assets", "style.css"), "body{}");
  collector = await startCollector({ port: 0, dbPath: ":memory:" });
  dashboard = await startDashboard({ dir, port: 0, collectorUrl: `http://localhost:${collector.port}` });
  base = `http://localhost:${dashboard.port}`;
});

afterEach(async () => {
  await dashboard.close();
  await collector.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("serving the built dashboard", () => {
  it("serves index.html at the root, with the right content types for assets", async () => {
    const page = await fetch(base);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toMatch(/text\/html/);
    expect(await page.text()).toContain("<title>Tracedye</title>");

    expect((await fetch(`${base}/assets/app.js`)).headers.get("content-type")).toMatch(/text\/javascript/);
    expect((await fetch(`${base}/assets/style.css`)).headers.get("content-type")).toMatch(/text\/css/);
  });

  it("gives a path with no extension index.html, and 404s a missing asset", async () => {
    expect(await (await fetch(`${base}/some/page`)).text()).toContain("<title>Tracedye</title>");
    expect((await fetch(`${base}/assets/missing.js`)).status).toBe(404);
  });

  it("never reads outside the dashboard folder", async () => {
    writeFileSync(path.join(dir, "..", "secret-outside.txt"), "secret");
    try {
      // sent raw, so nothing normalises the path before the server sees it
      const status = await new Promise<number>((resolve, reject) => {
        http.get({ host: "localhost", port: dashboard.port, path: "/..%2fsecret-outside.txt" }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        }).on("error", reject);
      });
      expect([403, 404]).toContain(status);
      expect((await fetch(`${base}/..%2fsecret-outside.txt`)).status).not.toBe(200);
    } finally {
      rmSync(path.join(dir, "..", "secret-outside.txt"), { force: true });
    }
  });
});

describe("passing through to the collector", () => {
  it("forwards /collector requests, methods and bodies included", async () => {
    expect(await (await fetch(`${base}/collector/state`)).json()).toEqual({ armed: null });
    expect(await (await fetch(`${base}/collector/triggers/user%20login/arm`, { method: "POST" })).json()).toEqual({ armed: "user login" });
    expect(await (await fetch(`${base}/collector/state`)).json()).toEqual({ armed: "user login" });
  });

  it("passes an error from the collector through unchanged", async () => {
    expect((await fetch(`${base}/collector/triggers/nope/events`)).status).toBe(404);
  });

  it("forwards the collector's WebSocket stream", async () => {
    const socket = new WebSocket(`ws://localhost:${dashboard.port}/collector/stream`);
    const messages: { type: string }[] = [];
    socket.on("message", (data) => messages.push(JSON.parse(data.toString())));
    await new Promise((resolve) => socket.on("open", resolve));
    await new Promise<void>((resolve) => {
      const wait = setInterval(() => messages.length >= 2 && (clearInterval(wait), resolve()), 25);
    });
    expect(messages.map((m) => m.type)).toEqual(["map", "trigger-state"]);

    await fetch(`${base}/collector/triggers/live/arm`, { method: "POST" });
    await new Promise<void>((resolve) => {
      const wait = setInterval(() => messages.length >= 3 && (clearInterval(wait), resolve()), 25);
    });
    expect(messages[2]).toEqual({ type: "trigger-state", armed: "live" });
    socket.close();
  });

  it("answers 502 when the collector is gone, instead of hanging", async () => {
    await collector.close();
    const response = await fetch(`${base}/collector/state`);
    expect(response.status).toBe(502);
    collector = await startCollector({ port: 0, dbPath: ":memory:" }); // so afterEach has something to close
  });

  it("ignores a WebSocket upgrade for any other path", async () => {
    const socket = new WebSocket(`ws://localhost:${dashboard.port}/elsewhere`);
    const failed = await new Promise<boolean>((resolve) => {
      socket.on("error", () => resolve(true));
      socket.on("open", () => resolve(false));
    });
    expect(failed).toBe(true);
  });
});
