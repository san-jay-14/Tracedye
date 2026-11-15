import type { Graph } from "./graph";

// What the viewer can switch off. The edge kinds are the three provenances; "unseen" hides the
// nodes that never ran, with the edges that lead to them.
export type Hideable = "observed" | "static" | "inferred" | "unseen";

export function filterGraph(graph: Graph, hidden: ReadonlySet<Hideable>): Graph {
  if (hidden.size === 0) return graph;
  const nodes = graph.nodes.filter((n) => n.seen || !hidden.has("unseen"));
  const kept = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter((e) => !hidden.has(e.provenance) && kept.has(e.from) && kept.has(e.to));
  return { nodes, edges };
}
