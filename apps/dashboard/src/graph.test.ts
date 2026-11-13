import type { CollectorEvent, MapData } from "collector/src/types";
import { describe, expect, it } from "vitest";
import { buildGraph } from "./graph";
import { NODE_HEIGHT, NODE_WIDTH, layoutNodes } from "./layout";

const map: MapData = {
  nodes: [
    { id: "route", kind: "app", label: "POST /login" },
    { id: "a", kind: "app", label: "handleLogin", file: "login.ts", line: 21 },
    { id: "b", kind: "app", label: "validate", file: "login.ts", line: 41 },
    { id: "email", kind: "app", label: "sendWelcomeEmail", file: "email.ts", line: 3 },
    { id: "pg", kind: "store", label: "Postgres" },
  ],
  edges: [
    { from: "route", to: "a", provenance: "static" },
    { from: "a", to: "b", provenance: "static" },
    { from: "b", to: "pg", provenance: "static" },
    { from: "a", to: "email", provenance: "inferred" },
  ],
};

const enter = (nodeId: string, spanId: string, parentId?: string, triggerId = "t1"): CollectorEvent => ({
  phase: "enter",
  triggerId,
  triggerName: "user login",
  nodeId,
  spanId,
  parentId,
});

const edge = (graph: ReturnType<typeof buildGraph>, from: string, to: string) =>
  graph.edges.find((e) => e.from === from && e.to === to);

describe("buildGraph provenance", () => {
  it("keeps every edge static or inferred when nothing has run", () => {
    const graph = buildGraph(map, []);
    expect(graph.edges.map((e) => e.provenance)).toEqual(["static", "static", "static", "inferred"]);
    expect(graph.nodes.every((n) => !n.seen)).toBe(true);
  });

  it("makes an edge observed only when a runtime call shows it", () => {
    const graph = buildGraph(map, [enter("a", "1"), enter("b", "2", "1")]);
    expect(edge(graph, "a", "b")?.provenance).toBe("observed");
    expect(edge(graph, "route", "a")?.provenance).toBe("static"); // the route itself never emits an event
    expect(edge(graph, "b", "pg")?.provenance).toBe("static"); // no span for Postgres yet
  });

  it("never upgrades an edge from a call that did not happen", () => {
    const graph = buildGraph(map, [enter("a", "1")]); // a ran, but did not call b
    expect(edge(graph, "a", "b")?.provenance).toBe("static");
    expect(edge(graph, "a", "email")?.provenance).toBe("inferred");
  });

  it("can upgrade an inferred edge when it is later seen running", () => {
    const graph = buildGraph(map, [enter("a", "1"), enter("email", "2", "1")]);
    expect(edge(graph, "a", "email")?.provenance).toBe("observed");
  });

  it("adds an observed edge, and its node, for a call the static map missed", () => {
    const graph = buildGraph(map, [enter("a", "1"), enter("dyn.ts:handler:9", "2", "1")]);
    expect(edge(graph, "a", "dyn.ts:handler:9")?.provenance).toBe("observed");
    expect(graph.nodes.find((n) => n.id === "dyn.ts:handler:9")).toMatchObject({ label: "handler", seen: true });
  });

  it("marks nodes that ran as seen and leaves the rest unseen", () => {
    const graph = buildGraph(map, [enter("a", "1"), enter("b", "2", "1")]);
    const seen = Object.fromEntries(graph.nodes.map((n) => [n.id, n.seen]));
    expect(seen).toEqual({ route: false, a: true, b: true, email: false, pg: false });
  });

  it("resolves parents within their own trigger only", () => {
    // span "1" means different functions in t1 and t2; the child must attach to its own trigger's span
    const graph = buildGraph(map, [enter("a", "1", undefined, "t1"), enter("route", "1", undefined, "t2"), enter("b", "2", "1", "t1")]);
    expect(edge(graph, "a", "b")?.provenance).toBe("observed");
    expect(edge(graph, "route", "b")).toBeUndefined();
  });

  it("ignores a child whose parent span was never seen", () => {
    const graph = buildGraph(map, [enter("b", "2", "99")]);
    expect(graph.edges.filter((e) => e.provenance === "observed")).toEqual([]);
  });

  it("does not mutate the map it was given", () => {
    const before = JSON.stringify(map);
    buildGraph(map, [enter("a", "1"), enter("b", "2", "1")]);
    expect(JSON.stringify(map)).toBe(before);
  });
});

describe("layoutNodes", () => {
  const nodes = [
    { id: "route", kind: "app" },
    { id: "a", kind: "app" },
    { id: "b", kind: "app" },
    { id: "pg", kind: "store" },
    { id: "llm", kind: "ai" },
    { id: "lonely", kind: "app" },
  ];
  const edges = [
    { from: "route", to: "a" },
    { from: "a", to: "b" },
    { from: "b", to: "pg" },
    { from: "a", to: "llm" },
  ];

  it("puts each node in a column after its caller", () => {
    const at = layoutNodes(nodes, edges);
    expect(at.get("route")!.x).toBeLessThan(at.get("a")!.x);
    expect(at.get("a")!.x).toBeLessThan(at.get("b")!.x);
    expect(at.get("b")!.x).toBeLessThan(at.get("pg")!.x);
    expect(at.get("llm")!.x).toBe(at.get("b")!.x);
  });

  it("never places two nodes on top of each other", () => {
    const at = layoutNodes(nodes, edges);
    const spots = [...at.values()];
    for (const [i, p] of spots.entries()) {
      for (const q of spots.slice(i + 1)) {
        const overlaps = Math.abs(p.x - q.x) < NODE_WIDTH && Math.abs(p.y - q.y) < NODE_HEIGHT;
        expect(overlaps).toBe(false);
      }
    }
    expect(at.size).toBe(nodes.length);
  });

  it("terminates on a cycle and on self-recursion", () => {
    const at = layoutNodes(
      [{ id: "x", kind: "app" }, { id: "y", kind: "app" }],
      [{ from: "x", to: "y" }, { from: "y", to: "x" }, { from: "x", to: "x" }],
    );
    expect(at.size).toBe(2);
    expect(at.get("x")!.x).toBeLessThan(at.get("y")!.x);
  });

  it("puts an external node, such as the browser, at the left even when the flow returns to it", () => {
    const at = layoutNodes(
      [{ id: "route", kind: "app" }, { id: "handler", kind: "app" }, { id: "client", kind: "external" }],
      [{ from: "client", to: "route" }, { from: "route", to: "handler" }, { from: "handler", to: "client" }],
    );
    expect(at.get("client")!.x).toBeLessThan(at.get("route")!.x);
    expect(at.get("route")!.x).toBeLessThan(at.get("handler")!.x);
  });

  it("ignores edges to unknown nodes", () => {
    expect(layoutNodes([{ id: "a", kind: "app" }], [{ from: "a", to: "ghost" }]).size).toBe(1);
  });

  it("gives the same positions whatever order the inputs arrive in", () => {
    const sorted = (positions: ReturnType<typeof layoutNodes>) =>
      Object.fromEntries([...positions].sort(([a], [b]) => a.localeCompare(b)));
    expect(sorted(layoutNodes([...nodes].reverse(), [...edges].reverse()))).toEqual(sorted(layoutNodes(nodes, edges)));
  });
});
