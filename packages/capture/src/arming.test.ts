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
    expect(scenarios.armed).toHaveLength(6);
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
