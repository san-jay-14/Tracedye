import type { CollectorEvent, MapData } from "collector/src/types";
import { describe, expect, it } from "vitest";
import { diffPayload } from "./diff";
import { buildGraph } from "./graph";
import { callStackOf, dedupeEvents, hopsOf, latestTriggerId, traversalsOf } from "./hops";

const base = { triggerId: "t1", triggerName: "user login" };
const enter = (nodeId: string, spanId: string, parentId?: string, input?: unknown, atMs = 0): CollectorEvent => ({
  ...base, phase: "enter", nodeId, spanId, parentId, input, atMs,
});
const exit = (nodeId: string, spanId: string, output?: unknown, durationMs = 1): CollectorEvent => ({
  ...base, phase: "exit", nodeId, spanId, output, durationMs,
});
const hop = (kind: NonNullable<CollectorEvent["kind"]>, nodeId: string, target: string, spanId: string, atMs: number, note?: string): CollectorEvent => ({
  ...base, phase: "hop", kind, nodeId, target, spanId, atMs, note,
});

// A login in miniature: the request arrives, then Postgres, the LLM, Redis and the client are called.
const login: CollectorEvent[] = [
  enter("handleLogin", "1", undefined, { req: { method: "POST" } }, 1),
  hop("http", "client", "POST /login", "1", 1),
  enter("validate", "2", "1", { email: "a@b.c", password: "[REDACTED]" }, 2),
  hop("db", "validate", "postgres", "2", 3),
  exit("validate", "2", { id: 1, email: "a@b.c", plan: "pro" }),
  enter("classify", "3", "1", { plan: "pro" }, 4),
  hop("llm", "classify", "llm", "3", 5, "stub"),
  exit("classify", "3", { segment: "power-user" }),
  enter("createSession", "4", "1", { segment: "power-user" }, 6),
  hop("cache", "createSession", "redis", "4", 7),
  exit("createSession", "4", "session:abc"),
  enter("notifyClient", "5", "1", { result: { key: "session:abc" } }, 8),
  hop("ws", "notifyClient", "client", "5", 9),
  exit("notifyClient", "5", undefined),
  exit("handleLogin", "1", undefined, 20),
];

describe("hopsOf", () => {
  const hops = hopsOf(login);

  it("finds all five hops of a login, in time order", () => {
    expect(hops.map((h) => `${h.kind}: ${h.from} -> ${h.to}`)).toEqual([
      "http: client -> POST /login",
      "db: validate -> postgres",
      "llm: classify -> llm",
      "cache: createSession -> redis",
      "ws: notifyClient -> client",
    ]);
  });

  it("gives each hop the input and output of the function call it belongs to", () => {
    const db = hops.find((h) => h.kind === "db")!;
    expect(db.before).toEqual({ email: "a@b.c", password: "[REDACTED]" });
    expect(db.after).toEqual({ id: 1, email: "a@b.c", plan: "pro" });
    expect(hops.find((h) => h.kind === "http")!.before).toEqual({ req: { method: "POST" } });
  });

  it("keeps a hop's note, such as the LLM being a stub", () => {
    expect(hops.find((h) => h.kind === "llm")!.note).toBe("stub");
  });

  it("puts a late-arriving span hop back where it happened", () => {
    const late = [...login.filter((e) => !(e.phase === "hop" && e.kind === "db")), login.find((e) => e.phase === "hop" && e.kind === "db")!];
    expect(hopsOf(late).map((h) => h.kind)).toEqual(["http", "db", "llm", "cache", "ws"]);
  });

  it("does not attach another trigger's payload", () => {
    const other: CollectorEvent[] = [...login, { ...enter("validate", "2", "1", { email: "other" }), triggerId: "t2" }];
    expect(hopsOf(other).find((h) => h.kind === "db")!.before).toEqual({ email: "a@b.c", password: "[REDACTED]" });
  });
});

describe("traversalsOf and the graph", () => {
  const map: MapData = {
    nodes: [
      { id: "POST /login", kind: "app", label: "POST /login" },
      { id: "handleLogin", kind: "app", label: "handleLogin" },
      { id: "validate", kind: "app", label: "validate" },
      { id: "postgres", kind: "store", label: "Postgres" },
      { id: "redis", kind: "store", label: "Redis" },
      { id: "createSession", kind: "app", label: "createSession" },
      { id: "notifyClient", kind: "app", label: "notifyClient" },
      { id: "classify", kind: "app", label: "classify" },
      { id: "llm", kind: "ai", label: "LLM" },
    ],
    edges: [
      { from: "POST /login", to: "handleLogin", provenance: "static" },
      { from: "handleLogin", to: "validate", provenance: "static" },
      { from: "validate", to: "postgres", provenance: "static" },
      { from: "createSession", to: "redis", provenance: "static" },
      { from: "classify", to: "llm", provenance: "static" },
    ],
  };
  const graph = buildGraph(map, login);
  const edge = (from: string, to: string) => graph.edges.find((e) => e.from === from && e.to === to);

  it("makes the edges of every hop observed, so the store and LLM edges are no longer static-only", () => {
    expect(edge("validate", "postgres")?.provenance).toBe("observed");
    expect(edge("createSession", "redis")?.provenance).toBe("observed");
    expect(edge("classify", "llm")?.provenance).toBe("observed");
    expect(edge("POST /login", "handleLogin")?.provenance).toBe("observed");
  });

  it("adds the browser as a node found only at runtime, with observed edges both ways", () => {
    expect(graph.nodes.find((n) => n.id === "client")).toMatchObject({ kind: "external", label: "React client", seen: true });
    expect(edge("client", "POST /login")?.provenance).toBe("observed");
    expect(edge("notifyClient", "client")?.provenance).toBe("observed");
  });

  it("leaves an edge static when only the function ran but the call out never happened", () => {
    const withoutRedis = login.filter((e) => !(e.phase === "hop" && e.kind === "cache"));
    expect(buildGraph(map, withoutRedis).edges.find((e) => e.from === "createSession" && e.to === "redis")?.provenance).toBe("static");
  });

  it("lists each crossing once, in order", () => {
    const keys = traversalsOf(login).map((t) => `${t.from}->${t.to}`);
    expect(keys.slice(0, 3)).toEqual(["client->POST /login", "POST /login->handleLogin", "handleLogin->validate"]);
    expect(new Set(traversalsOf(login).map((t) => t.key)).size).toBe(traversalsOf(login).length);
  });
});

describe("callStackOf", () => {
  it("lists the trigger's calls depth-first with timings and nesting", () => {
    const { rows } = callStackOf(login, "t1");
    expect(rows.map((r) => [r.depth, r.nodeId])).toEqual([
      [0, "handleLogin"],
      [1, "validate"],
      [1, "classify"],
      [1, "createSession"],
      [1, "notifyClient"],
    ]);
    expect(rows[0].durationMs).toBe(20);
  });

  it("reports functions that were collapsed", () => {
    const events = [...login, { ...base, phase: "collapsed" as const, nodeId: "tick", calls: 25 }];
    expect(callStackOf(events, "t1").collapsed).toEqual([{ nodeId: "tick", calls: 25 }]);
  });

  it("ignores other triggers", () => {
    expect(callStackOf(login, "nope").rows).toEqual([]);
  });
});

describe("helpers", () => {
  it("dedupes events that arrive both stored and live", () => {
    expect(dedupeEvents([...login, ...login])).toHaveLength(login.length);
  });

  it("finds the latest trigger", () => {
    expect(latestTriggerId([...login, { ...enter("x", "9"), triggerId: "t2" }])).toBe("t2");
    expect(latestTriggerId([])).toBeUndefined();
  });
});

describe("diffPayload", () => {
  it("marks fields added, removed, changed and unchanged", () => {
    const rows = diffPayload({ email: "a@b.c", password: "[REDACTED]", plan: "free" }, { email: "a@b.c", plan: "pro", id: 1 });
    expect(Object.fromEntries(rows.map((r) => [r.path, r.status]))).toEqual({
      email: "same",
      password: "removed",
      plan: "changed",
      id: "added",
    });
  });

  it("compares nested fields by path", () => {
    const rows = diffPayload({ user: { id: 1, plan: "pro" } }, { user: { id: 1, plan: "pro", segment: "power-user" } });
    expect(rows.map((r) => `${r.path}:${r.status}`)).toEqual(["user.id:same", "user.plan:same", "user.segment:added"]);
  });

  it("handles a value that is not an object, and missing payloads", () => {
    expect(diffPayload({ segment: "x" }, "session:abc").map((r) => `${r.path}:${r.status}`)).toEqual(["segment:removed", "(value):added"]);
    expect(diffPayload(undefined, undefined)).toEqual([]);
    expect(diffPayload({ a: 1 }, undefined).map((r) => r.status)).toEqual(["removed"]);
  });
});
