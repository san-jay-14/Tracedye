import { describe, expect, it } from "vitest";
import { runFixture } from "./run-fixture";
import type { CaptureEvent } from "./runtime.js";

describe("armed triggers", () => {
  const scenarios = runFixture<Record<string, CaptureEvent[]>>("arming");
  const triggerIds = (name: string) => [...new Set(scenarios[name].map((e) => e.triggerId))];

  it("emits nothing while unarmed", () => {
    expect(scenarios.unarmed).toEqual([]);
  });

  it("emits nothing after disarming, even on a reused connection", () => {
    expect(scenarios.disarmed).toEqual([]);
  });

  it("emits nothing for calls made outside any request", () => {
    expect(scenarios.outsideRequest).toEqual([]);
  });

  it("tags every event of an armed request with one trigger id", () => {
    expect(scenarios.armed).toHaveLength(7); // 6 function events and the http hop
    const ids = triggerIds("armed");
    expect(ids).toHaveLength(1);
    expect(ids[0]).toMatch(/^user-login-[0-9a-f]{8}$/);
  });

  it("gives each request its own trigger id", () => {
    expect(triggerIds("armedAgain")[0]).not.toBe(triggerIds("armed")[0]);
  });

  it("uses a caller-supplied x-trigger-id", () => {
    expect(triggerIds("withHeader")).toEqual(["custom-1"]);
  });

  it("ignores an unsafe x-trigger-id and mints one", () => {
    expect(triggerIds("badHeader")[0]).toMatch(/^user-login-[0-9a-f]{8}$/);
  });
});

describe("the http hop", () => {
  const scenarios = runFixture<Record<string, CaptureEvent[]>>("arming");

  it("is reported once per armed request, from the client to the route, at the first call", () => {
    for (const name of ["armed", "armedAgain", "withHeader"]) {
      const hops = scenarios[name].filter((e) => e.phase === "hop");
      expect(hops).toHaveLength(1);
      const first = scenarios[name].find((e) => e.phase === "enter")!;
      expect(hops[0]).toMatchObject({ kind: "http", nodeId: "client", target: "GET /", spanId: (first as { spanId: string }).spanId });
    }
  });

  it("is not reported when nothing is armed", () => {
    expect(scenarios.unarmed.some((e) => e.phase === "hop")).toBe(false);
    expect(scenarios.disarmed.some((e) => e.phase === "hop")).toBe(false);
  });
});
