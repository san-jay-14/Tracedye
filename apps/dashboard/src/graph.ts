import type { CollectorEvent, MapData, MapNode, Provenance } from "collector/src/types";
import { edgeId, labelOf, traversalsOf } from "./hops";

export interface GraphNode extends MapNode {
  // True once a runtime event has shown this node running. Unseen nodes are static only.
  seen: boolean;
  // Set on a box that stands for several nodes; it can be opened to show them.
  container?: { caption: string };
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  provenance: Provenance;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}


// Combines the static map with what actually ran. An edge is observed only if a runtime
// event shows that call; everything else keeps the provenance the map gave it, so a
// static or inferred edge is never presented as observed.
export function buildGraph(map: MapData, events: CollectorEvent[]): Graph {
  const nodes = new Map<string, GraphNode>(map.nodes.map((node) => [node.id, { ...node, seen: false }]));
  const edges = new Map<string, GraphEdge>(
    map.edges.map((edge) => [edgeId(edge.from, edge.to), { id: edgeId(edge.from, edge.to), ...edge }]),
  );

  const ensure = (nodeId: string, kind: MapNode["kind"] = "app") => {
    const node = nodes.get(nodeId) ?? { id: nodeId, kind, label: labelOf(nodeId), seen: false };
    node.seen = true;
    nodes.set(nodeId, node);
  };

  // Hop events are left to their traversals below, which know the kinds of both ends.
  for (const event of events) if (event.phase !== "hop") ensure(event.nodeId);

  // An edge is observed exactly when some event crossed it. A target the static map has
  // never heard of (the browser, a route found only at runtime) is added as seen.
  for (const traversal of traversalsOf(events)) {
    ensure(traversal.from, traversal.fromKind);
    ensure(traversal.to, traversal.toKind);
    const id = edgeId(traversal.from, traversal.to);
    edges.set(id, { id, from: traversal.from, to: traversal.to, provenance: "observed" });
  }

  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

