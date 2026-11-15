import type { Provenance } from "collector/src/types";
import { edgeId } from "./hops";
import type { Graph, GraphEdge, GraphNode } from "./graph";

// Three levels of detail over the same map:
//   System     the backend is one box, next to the browser, the stores and the model
//   APIs       the backend opens into one box per route, with the code behind it
//   Functions  every function
// A box that stands for several nodes is a group. Opening a group swaps it for what is inside it.

export const BACKEND = "group:backend";
const SHARED = "group:shared";
const apiGroup = (routeId: string) => `group:api:${routeId}`;

// What counts as an API: an HTTP route, which the indexer labels "METHOD /path".
const ROUTE = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|ALL)\s+\//;

export interface Hierarchy {
  groups: Map<string, { label: string; parent?: string }>;
  groupOf: Map<string, string>; // function node id -> the API group it sits in
}

interface HierarchyNode {
  id: string;
  kind: string;
  label: string;
}

// Each function belongs to the route it can be reached from. Code reachable from several routes,
// or from none, goes in a shared group, so a function is never claimed by an API it does not belong to.
export function buildHierarchy(nodes: HierarchyNode[], edges: { from: string; to: string }[]): Hierarchy {
  const app = new Set(nodes.filter((n) => n.kind === "app").map((n) => n.id));
  const calls = new Map<string, string[]>();
  for (const edge of edges) if (app.has(edge.from) && app.has(edge.to)) calls.set(edge.from, [...(calls.get(edge.from) ?? []), edge.to]);

  const routes = nodes.filter((n) => n.kind === "app" && ROUTE.test(n.label)).sort((a, b) => a.id.localeCompare(b.id));
  const owners = new Map<string, Set<string>>();
  for (const route of routes) {
    const queue = [route.id];
    const seen = new Set(queue);
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      owners.set(id, (owners.get(id) ?? new Set()).add(route.id));
      for (const next of calls.get(id) ?? []) if (!seen.has(next)) (seen.add(next), queue.push(next));
    }
  }

  const groups = new Map<string, { label: string; parent?: string }>([[BACKEND, { label: "Backend" }]]);
  const groupOf = new Map<string, string>();
  for (const id of [...app].sort()) {
    const own = owners.get(id);
    if (own?.size === 1) {
      const routeId = [...own][0];
      const group = apiGroup(routeId);
      groups.set(group, { label: routes.find((r) => r.id === routeId)?.label ?? routeId, parent: BACKEND });
      groupOf.set(id, group);
    } else {
      groups.set(SHARED, { label: routes.length ? "Shared code" : "Backend code", parent: BACKEND });
      groupOf.set(id, SHARED);
    }
  }
  return { groups, groupOf };
}

// The box that stands for a node, given which groups are open.
export function visibleId(h: Hierarchy, expanded: ReadonlySet<string>, id: string): string {
  const group = h.groupOf.get(id);
  if (!group) return id; // the browser, stores and the model are always themselves
  if (!expanded.has(BACKEND)) return BACKEND;
  return expanded.has(group) ? id : group;
}

// Which preset a set of open groups corresponds to, if it matches one.
export type Level = "system" | "apis" | "functions";

export function expandedFor(h: Hierarchy, level: Level): Set<string> {
  if (level === "system") return new Set();
  if (level === "apis") return new Set([BACKEND]);
  return new Set(h.groups.keys());
}

export function levelOf(h: Hierarchy, expanded: ReadonlySet<string>): Level | undefined {
  for (const level of ["system", "apis", "functions"] as const) {
    const preset = expandedFor(h, level);
    if (preset.size === expanded.size && [...preset].every((id) => expanded.has(id))) return level;
  }
  return undefined;
}

const RANK: Record<Provenance, number> = { observed: 3, static: 2, inferred: 1 };

// The graph as seen at the chosen level. Provenance stays honest: a combined edge is observed only
// if some call across it was observed. Otherwise it is static or inferred, as the map said.
export function abstractGraph(graph: Graph, h: Hierarchy, expanded: ReadonlySet<string>): Graph {
  const nodes = new Map<string, GraphNode>();
  const inside = new Map<string, string[]>();
  for (const node of graph.nodes) {
    const id = visibleId(h, expanded, node.id);
    if (id === node.id) {
      nodes.set(id, node);
      continue;
    }
    const box = nodes.get(id) ?? { id, kind: "app" as const, label: h.groups.get(id)?.label ?? id, seen: false };
    box.seen ||= node.seen;
    nodes.set(id, box);
    inside.set(id, [...(inside.get(id) ?? []), node.id]);
  }
  for (const [id, members] of inside) {
    const box = nodes.get(id) as GraphNode;
    const apis = id === BACKEND ? new Set(members.map((m) => h.groupOf.get(m))).size : 0;
    box.container = { caption: id === BACKEND ? `${apis} ${apis === 1 ? "API" : "APIs"} · ${members.length} functions` : `${members.length} functions` };
  }

  const edges = new Map<string, GraphEdge>();
  for (const edge of graph.edges) {
    const from = visibleId(h, expanded, edge.from);
    const to = visibleId(h, expanded, edge.to);
    if (from === to) continue;
    const id = edgeId(from, to);
    const known = edges.get(id);
    if (!known || RANK[edge.provenance] > RANK[known.provenance]) edges.set(id, { id, from, to, provenance: edge.provenance });
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}
