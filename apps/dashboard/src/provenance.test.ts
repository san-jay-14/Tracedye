import { describe, expect, it } from "vitest";
import { EDGE_LOOK } from "./provenance";

describe("edge provenance styling", () => {
  it("draws observed edges solid and full strength", () => {
    expect(EDGE_LOOK.observed.strokeDasharray).toBeUndefined();
    expect(EDGE_LOOK.observed.opacity).toBe(1);
  });

  it("draws static edges dashed and faded, so they never pass for observed", () => {
    expect(EDGE_LOOK.static.strokeDasharray).toBeDefined();
    expect(EDGE_LOOK.static.opacity).toBeLessThan(EDGE_LOOK.observed.opacity);
    expect(EDGE_LOOK.static.strokeWidth).toBeLessThan(EDGE_LOOK.observed.strokeWidth);
  });

  it("draws inferred edges dotted and labeled", () => {
    expect(EDGE_LOOK.inferred.strokeDasharray).not.toBe(EDGE_LOOK.static.strokeDasharray);
    expect(EDGE_LOOK.inferred.label).toBe("inferred");
  });

  it("gives all three a distinct look", () => {
    const looks = Object.values(EDGE_LOOK).map((look) => JSON.stringify(look));
    expect(new Set(looks).size).toBe(3);
    expect(new Set(Object.values(EDGE_LOOK).map((look) => look.stroke)).size).toBe(3);
  });
});
