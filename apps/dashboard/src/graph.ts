import type { CollectorEvent, MapData, MapNode, Provenance } from "collector/src/types";

export interface GraphNode extends MapNode {
  // True once a runtime event has shown this node running. Unseen nodes are static only.
  seen: boolean;
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

const edgeId = (from: string, to: string) => `${from}->${to}`;

// Combines the static map with what actually ran. An edge is observed only if a runtime
// event shows that call; everything else keeps the provenance the map gave it, so a
// static or inferred edge is never presented as observed.
export function buildGraph(map: MapData, events: CollectorEvent[]): Graph {
  const nodes = new Map<string, GraphNode>(map.nodes.map((node) => [node.id, { ...node, seen: false }]));
  const edges = new Map<string, GraphEdge>(
    map.edges.map((edge) => [edgeId(edge.from, edge.to), { id: edgeId(edge.from, edge.to), ...edge }]),
  );

  const markSeen = (nodeId: string) => {
    const node = nodes.get(nodeId) ?? { id: nodeId, kind: "app", label: labelOf(nodeId), seen: false };
    node.seen = true;
    nodes.set(nodeId, node);
  };

  // Span ids are only unique inside one trigger, so resolve parents per trigger.
  const spanNodes = new Map<string, Map<string, string>>();
  for (const event of events) {
    markSeen(event.nodeId);
    if (event.phase !== "enter" || event.spanId === undefined) continue;
    let spans = spanNodes.get(event.triggerId);
    if (!spans) spanNodes.set(event.triggerId, (spans = new Map()));
    spans.set(event.spanId, event.nodeId);
  }

  for (const event of events) {
    if (event.phase !== "enter" || event.parentId === undefined) continue;
    const parentNode = spanNodes.get(event.triggerId)?.get(event.parentId);
    if (parentNode === undefined) continue;
    const id = edgeId(parentNode, event.nodeId);
    edges.set(id, { id, from: parentNode, to: event.nodeId, provenance: "observed" });
  }

  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

// "file:name:line" -> "name". Only used for nodes that ran but the static map never saw.
function labelOf(nodeId: string): string {
  return nodeId.split(":").at(-2) ?? nodeId;
}
