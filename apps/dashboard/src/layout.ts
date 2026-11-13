export const NODE_WIDTH = 176;
export const NODE_HEIGHT = 52;
const COLUMN_GAP = 56;
const ROW_GAP = 22;

interface LayoutInput {
  id: string;
  kind: string;
}

interface LayoutEdge {
  from: string;
  to: string;
}

const KIND_ORDER = ["external", "app", "ai", "store"];

// Left-to-right layers: a node sits one column after its furthest-back caller.
// Calls that loop back (recursion, cycles) are ignored for placement so layout always ends.
export function layoutNodes(nodes: LayoutInput[], edges: LayoutEdge[]): Map<string, { x: number; y: number }> {
  const known = new Set(nodes.map((n) => n.id));
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    if (!known.has(edge.from) || !known.has(edge.to)) continue;
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
  }

  const forward = new Map<string, string[]>(); // callee -> callers, without back edges
  const state = new Map<string, "open" | "done">();
  const visit = (id: string) => {
    state.set(id, "open");
    for (const target of outgoing.get(id) ?? []) {
      if (state.get(target) === "open") continue; // back edge
      forward.set(target, [...(forward.get(target) ?? []), id]);
      if (!state.has(target)) visit(target);
    }
    state.set(id, "done");
  };
  // Start from external nodes (the browser), so a request flows left to right from it and the
  // call that returns to it is the one treated as a back edge.
  const starts = [...nodes].sort((a, b) => Number(b.kind === "external") - Number(a.kind === "external") || byId(a, b));
  for (const node of starts) if (!state.has(node.id)) visit(node.id);

  const layerOf = new Map<string, number>();
  const layer = (id: string): number => {
    const cached = layerOf.get(id);
    if (cached !== undefined) return cached;
    const value = Math.max(-1, ...(forward.get(id) ?? []).map(layer)) + 1;
    layerOf.set(id, value);
    return value;
  };

  const columns = new Map<number, LayoutInput[]>();
  for (const node of nodes) {
    const column = layer(node.id);
    columns.set(column, [...(columns.get(column) ?? []), node]);
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const [column, members] of columns) {
    members.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || byId(a, b));
    members.forEach((node, row) => {
      positions.set(node.id, { x: column * (NODE_WIDTH + COLUMN_GAP), y: row * (NODE_HEIGHT + ROW_GAP) });
    });
  }
  return positions;
}

const byId = (a: LayoutInput, b: LayoutInput) => a.id.localeCompare(b.id);
