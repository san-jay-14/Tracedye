import { describe, expect, it } from "vitest";
import { isProjectSource } from "./filter.js";
import { runFixture } from "./run-fixture";
import type { FunctionEvent } from "./runtime.js";

describe("isProjectSource", () => {
  const dir = "/repo/app";

  it("accepts project TypeScript files", () => {
    expect(isProjectSource("/repo/app/server/login.ts", dir)).toBe(true);
  });

  it.each([
    ["dependencies", "/repo/app/node_modules/pkg/index.ts"],
    ["test files", "/repo/app/server/login.test.ts"],
    ["spec files", "/repo/app/server/login.spec.ts"],
    ["__tests__ folders", "/repo/app/__tests__/login.ts"],
    ["generated folders", "/repo/app/generated/api.ts"],
    ["generated files", "/repo/app/api.generated.ts"],
    ["declaration files", "/repo/app/types.d.ts"],
    ["non-TypeScript files", "/repo/app/server/login.js"],
    ["files outside the project", "/repo/other/login.ts"],
  ])("rejects %s", (_name, file) => {
    expect(isProjectSource(file, dir)).toBe(false);
  });
});

describe("load-time wrapper", () => {
  const { result, events } = runFixture<{ result: number; events: FunctionEvent[] }>("main");

  const exitOf = (name: string) => events.find((e) => e.phase === "exit" && e.nodeId.includes(`:${name}:`))!;
  const enterOf = (name: string) => events.find((e) => e.phase === "enter" && e.nodeId.includes(`:${name}:`))!;

  it("leaves the behaviour of the code unchanged", () => {
    expect(result).toBe(5);
  });

  it("emits enter and exit for the function and everything it calls", () => {
    for (const name of ["outer", "inner", "leaf"]) {
      expect(enterOf(name)).toBeDefined();
      expect(exitOf(name)).toBeDefined();
    }
    expect(events).toHaveLength(6);
  });

  it("uses file:name:line ids relative to the workspace root", () => {
    expect(enterOf("outer").nodeId).toBe("packages/capture/fixtures/chain.ts:outer:1");
    expect(enterOf("inner").nodeId).toBe("packages/capture/fixtures/chain.ts:inner:6");
    expect(enterOf("leaf").nodeId).toBe("packages/capture/fixtures/chain.ts:leaf:14");
  });

  it("records durations that include async waits", () => {
    expect(exitOf("leaf").durationMs).toBeGreaterThanOrEqual(15);
    expect(exitOf("outer").durationMs).toBeGreaterThanOrEqual(exitOf("leaf").durationMs!);
  });

  it("links callees to their caller", () => {
    const outerSpan = enterOf("outer").spanId;
    expect(enterOf("outer").parentId).toBeUndefined();
    expect(enterOf("inner").parentId).toBe(outerSpan);
    expect(enterOf("leaf").parentId).toBe(outerSpan);
  });

  it("does not wrap code outside the project directory", () => {
    expect(events.some((e) => e.nodeId.includes("src/"))).toBe(false);
  });

  it("tags every event with the trigger id", () => {
    expect(events.every((e) => e.triggerId === "t1")).toBe(true);
    expect(events.every((e) => e.triggerName === "fixture")).toBe(true);
  });
});

describe("skip rules", () => {
  const { events } = runFixture<{ events: FunctionEvent[] }>("main");

  it("leaves trivial functions unwrapped", () => {
    expect(events.some((e) => e.nodeId.includes(":double:"))).toBe(false);
  });

  it("still wraps functions that have a body of real work", () => {
    expect(events.some((e) => e.nodeId.includes(":inner:"))).toBe(true);
  });
});
