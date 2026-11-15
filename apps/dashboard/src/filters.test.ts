import { describe, expect, it } from "vitest";
import { filterGraph } from "./filters";
import type { Graph } from "./graph";

const graph: Graph = {
  nodes: [
    { id: "a", kind: "app", label: "a", seen: true },
    { id: "b", kind: "app", label: "b", seen: true },
    { id: "c", kind: "app", label: "c", seen: false },
  ],
  edges: [
    { id: "a->b", from: "a", to: "b", provenance: "observed" },
    { id: "b->c", from: "b", to: "c", provenance: "static" },
    { id: "a->c", from: "a", to: "c", provenance: "inferred" },
  ],
};

describe("filterGraph", () => {
  it("changes nothing when nothing is hidden", () => {
    expect(filterGraph(graph, new Set())).toBe(graph);
  });

  it("hides edges of a hidden kind", () => {
    const result = filterGraph(graph, new Set(["static", "inferred"]));
    expect(result.edges.map((e) => e.id)).toEqual(["a->b"]);
    expect(result.nodes).toHaveLength(3);
  });

  it("hides nodes that never ran, with the edges that lead to them", () => {
    const result = filterGraph(graph, new Set(["unseen"]));
    expect(result.nodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(result.edges.map((e) => e.id)).toEqual(["a->b"]);
  });
});
