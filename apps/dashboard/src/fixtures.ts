// Test data only: a login in miniature, in the order its events happened.
import type { CollectorEvent, MapData } from "collector/src/types";

const base = { triggerId: "t1", triggerName: "user login" };

export const enter = (nodeId: string, spanId: string, parentId?: string, input?: unknown, atMs = 0): CollectorEvent => ({
  ...base, phase: "enter", nodeId, spanId, parentId, input, atMs,
});

export const exit = (nodeId: string, spanId: string, output?: unknown, durationMs = 1, atMs = 0): CollectorEvent => ({
  ...base, phase: "exit", nodeId, spanId, output, durationMs, atMs,
});

export const hop = (
  kind: NonNullable<CollectorEvent["kind"]>,
  nodeId: string,
  target: string,
  spanId: string,
  atMs: number,
  note?: string,
): CollectorEvent => ({ ...base, phase: "hop", kind, nodeId, target, spanId, atMs, note });

// The request arrives, then Postgres, the LLM, Redis and the client are called.
export const login: CollectorEvent[] = [
  enter("handleLogin", "1", undefined, { req: { method: "POST" } }, 1),
  hop("http", "client", "POST /login", "1", 1),
  enter("validate", "2", "1", { email: "a@b.c", password: "[REDACTED]" }, 2),
  hop("db", "validate", "postgres", "2", 3),
  exit("validate", "2", { id: 1, email: "a@b.c", plan: "pro" }, 1, 3.5),
  enter("classify", "3", "1", { plan: "pro" }, 4),
  hop("llm", "classify", "llm", "3", 5, "stub"),
  exit("classify", "3", { segment: "power-user" }, 1, 5.5),
  enter("createSession", "4", "1", { segment: "power-user" }, 6),
  hop("cache", "createSession", "redis", "4", 7),
  exit("createSession", "4", "session:abc", 1, 7.5),
  enter("notifyClient", "5", "1", { result: { key: "session:abc" } }, 8),
  hop("ws", "notifyClient", "client", "5", 9),
  exit("notifyClient", "5", undefined, 1, 9.5),
  exit("handleLogin", "1", undefined, 20, 21),
];

export const loginMap: MapData = {
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
