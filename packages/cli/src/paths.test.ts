import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { locateRuntime } from "./paths";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe("locateRuntime", () => {
  it("uses everything beside it when it is the published package", () => {
    const base = mkdtempSync(path.join(tmpdir(), "tracedye-dist-"));
    dirs.push(base);
    mkdirSync(path.join(base, "capture"));
    writeFileSync(path.join(base, "capture", "register.js"), "");

    const runtime = locateRuntime(base);
    expect(runtime.dashboard).toEqual({ kind: "static", dir: path.join(base, "dashboard") });
    expect(runtime.indexer).toEqual({ command: process.execPath, args: [path.join(base, "indexer.js")] });
    expect(runtime.preloads).toEqual({
      start: pathToFileURL(path.join(base, "preload", "start.mjs")).href,
      captureRegister: pathToFileURL(path.join(base, "capture", "register.js")).href,
      captureForward: pathToFileURL(path.join(base, "capture", "forward.js")).href,
      otel: pathToFileURL(path.join(base, "preload", "otel.mjs")).href,
    });
  });

  it("finds the workspace packages when it runs from a checkout of the repo", () => {
    const runtime = locateRuntime();
    expect(runtime.preloads.captureRegister).toMatch(/packages\/capture\/src\/register\.js$/);
    expect(runtime.preloads.captureForward).toMatch(/packages\/capture\/src\/forward\.js$/);
    expect(runtime.preloads.start).toMatch(/preload\/start\.mjs$/);
    expect(runtime.indexer.args.at(-1)).toMatch(/indexer[\\/]src[\\/]cli\.ts$/);
    expect(["static", "vite"]).toContain(runtime.dashboard.kind);
  });
});
