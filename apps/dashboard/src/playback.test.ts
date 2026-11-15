import { beforeEach, describe, expect, it, vi } from "vitest";
import { BASE_STEP_MS, SPEEDS, clampPosition, loadSpeed, saveSpeed, shiftSpeed, speedLabel, stepDelay } from "./playback";

describe("playback timing", () => {
  it("scales the time of a step by the speed", () => {
    expect(stepDelay(1)).toBe(BASE_STEP_MS);
    expect(stepDelay(2)).toBe(BASE_STEP_MS / 2);
    expect(stepDelay(0.25)).toBe(BASE_STEP_MS * 4);
  });

  it("has no wait at all at instant speed", () => {
    expect(stepDelay(Infinity)).toBe(0);
  });

  it("labels speeds for people", () => {
    expect(SPEEDS.map(speedLabel)).toEqual(["0.25×", "0.5×", "1×", "2×", "4×", "Instant"]);
  });

  it("keeps a position within the steps there are", () => {
    expect(clampPosition(-3, 10)).toBe(0);
    expect(clampPosition(4, 10)).toBe(4);
    expect(clampPosition(99, 10)).toBe(10);
    expect(clampPosition(5, 0)).toBe(0);
  });
});

describe("shiftSpeed", () => {
  it("moves one notch up or down the list", () => {
    expect(shiftSpeed(1, 1)).toBe(2);
    expect(shiftSpeed(1, -1)).toBe(0.5);
    expect(shiftSpeed(4, 1)).toBe(Infinity);
  });

  it("stops at both ends", () => {
    expect(shiftSpeed(0.25, -1)).toBe(0.25);
    expect(shiftSpeed(Infinity, 1)).toBe(Infinity);
  });

  it("starts from 1x when the current speed is not on the list", () => {
    expect(shiftSpeed(3, 1)).toBe(2);
  });
});

describe("remembering the speed", () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
    });
  });

  it("defaults to 1x", () => {
    expect(loadSpeed()).toBe(1);
  });

  it("remembers a chosen speed, including instant", () => {
    saveSpeed(0.5);
    expect(loadSpeed()).toBe(0.5);
    saveSpeed(Infinity);
    expect(loadSpeed()).toBe(Infinity);
  });

  it("ignores a stored value that is not a real speed", () => {
    localStorage.setItem("tracedye.speed", "7");
    expect(loadSpeed()).toBe(1);
    localStorage.setItem("tracedye.speed", "banana");
    expect(loadSpeed()).toBe(1);
  });
});
