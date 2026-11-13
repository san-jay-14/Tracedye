import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { startCollector, type Collector } from "./server";
import type { CollectorEvent, StreamMessage } from "./types";

let collector: Collector | undefined;
afterEach(async () => {
  await collector?.close();
  collector = undefined;
});

async function start(dbPath = ":memory:") {
  collector = await startCollector({ port: 0, dbPath });
  const base = `http://localhost:${collector.port}`;
  const post = (url: string, body?: unknown) =>
    fetch(base + url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const get = async (url: string) => (await fetch(base + url)).json();
  return { port: collector.port, post, get };
}

const event = (triggerId: string, nodeId: string, phase: CollectorEvent["phase"], extra: Partial<CollectorEvent> = {}): CollectorEvent => ({
  phase,
  triggerId,
  triggerName: "user login",
  nodeId,
  spanId: "1",
  atMs: 1,
  ...extra,
});

// Collects messages from /stream and lets a test wait for the next one it needs.
async function connect(port: number) {
  const socket = new WebSocket(`ws://localhost:${port}/stream`);
  const messages: StreamMessage[] = [];
  const waiting: Array<() => void> = [];
  socket.on("message", (data) => {
    messages.push(JSON.parse(data.toString()));
    waiting.splice(0).forEach((wake) => wake());
  });
  await new Promise((resolve) => socket.on("open", resolve));
  const until = async (predicate: () => boolean) => {
    while (!predicate()) await new Promise<void>((resolve) => waiting.push(resolve));
  };
  return { socket, messages, until };
}

describe("reading a stored trigger back", () => {
  it("returns a trigger's events in the order they were received, payloads intact", async () => {
    const { post, get } = await start();
    const sent = [
      event("t1", "login.ts:handleLogin:21", "enter", { input: { email: "a@b.c", password: "[REDACTED]" } }),
      event("t1", "login.ts:validateCredentials:41", "enter", { spanId: "2", parentId: "1" }),
      event("t1", "login.ts:validateCredentials:41", "exit", { spanId: "2", parentId: "1", durationMs: 12.5, output: { id: 1 } }),
      event("t1", "login.ts:handleLogin:21", "exit", { durationMs: 20, output: null }),
    ];

    // Split across two batches: order must hold across them as well as within one.
    expect((await post("/events", sent.slice(0, 2))).status).toBe(200);
    expect((await post("/events", sent.slice(2))).status).toBe(200);

    expect(await get("/triggers/t1/events")).toEqual(sent);
  });

  it("keeps triggers apart and lists them with their name and event count", async () => {
    const { post, get } = await start();
    await post("/events", [event("t1", "a:f:1", "enter"), event("t2", "a:f:1", "enter"), event("t1", "a:f:1", "exit")]);

    expect((await get("/triggers/t1/events")).map((e: CollectorEvent) => e.phase)).toEqual(["enter", "exit"]);
    expect((await get("/triggers/t2/events")).map((e: CollectorEvent) => e.phase)).toEqual(["enter"]);
    const triggers = await get("/triggers");
    expect(triggers.map((t: { id: string; name: string; events: number }) => [t.id, t.name, t.events])).toEqual([
      ["t1", "user login", 2],
      ["t2", "user login", 1],
    ]);
  });

  it("stores collapsed events and the threw flag", async () => {
    const { post, get } = await start();
    const sent = [
      event("t1", "a:tick:1", "exit", { threw: true }),
      { phase: "collapsed" as const, triggerId: "t1", triggerName: "user login", nodeId: "a:tick:1", calls: 25 },
    ];
    await post("/events", sent);
    expect(await get("/triggers/t1/events")).toEqual(sent);
  });

  it("answers 404 for an unknown trigger", async () => {
    const { get } = await start();
    expect(await get("/triggers/nope/events")).toEqual({ error: "unknown trigger" });
  });

  it("survives a restart when backed by a file", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "collector-"));
    try {
      const dbPath = path.join(dir, "test.db");
      const first = await start(dbPath);
      const sent = [event("t1", "a:f:1", "enter"), event("t1", "a:f:1", "exit", { durationMs: 3 })];
      await first.post("/events", sent);
      await collector!.close();

      const second = await start(dbPath);
      expect(await second.get("/triggers/t1/events")).toEqual(sent);
    } finally {
      await collector?.close();
      collector = undefined;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the /stream WebSocket", () => {
  it("sends the current map and trigger state when a client connects", async () => {
    const { port, post } = await start();
    await post("/map", { nodes: [{ id: "n1", kind: "app", label: "n1" }], edges: [] });
    await post("/triggers/user%20login/arm");

    const client = await connect(port);
    await client.until(() => client.messages.length >= 2);
    expect(client.messages).toEqual([
      { type: "map", nodes: [{ id: "n1", kind: "app", label: "n1" }], edges: [] },
      { type: "trigger-state", armed: "user login" },
    ]);
    client.socket.close();
  });

  it("pushes events live, in order, as they are ingested", async () => {
    const { port, post } = await start();
    const client = await connect(port);
    await client.until(() => client.messages.length >= 2); // initial map and state

    const sent = [event("t1", "a:f:1", "enter"), event("t1", "a:g:2", "enter"), event("t1", "a:g:2", "exit"), event("t1", "a:f:1", "exit")];
    await post("/events", sent.slice(0, 2));
    await post("/events", sent.slice(2));
    await client.until(() => client.messages.length >= 2 + sent.length);

    expect(client.messages.slice(2)).toEqual(sent.map((e) => ({ type: "event", event: e })));
    client.socket.close();
  });

  it("pushes a new map and trigger state changes to a connected client", async () => {
    const { port, post } = await start();
    const client = await connect(port);
    await client.until(() => client.messages.length >= 2);

    await post("/map", { nodes: [{ id: "n1", kind: "store", label: "Postgres" }], edges: [{ from: "n1", to: "n1", provenance: "static" }] });
    await post("/triggers/user%20login/arm");
    await post("/triggers/user%20login/disarm");
    await client.until(() => client.messages.length >= 5);

    expect(client.messages.slice(2)).toEqual([
      { type: "map", nodes: [{ id: "n1", kind: "store", label: "Postgres" }], edges: [{ from: "n1", to: "n1", provenance: "static" }] },
      { type: "trigger-state", armed: "user login" },
      { type: "trigger-state", armed: null },
    ]);
    client.socket.close();
  });

  it("delivers to every connected client", async () => {
    const { port, post } = await start();
    const [a, b] = await Promise.all([connect(port), connect(port)]);
    await Promise.all([a.until(() => a.messages.length >= 2), b.until(() => b.messages.length >= 2)]);

    await post("/events", [event("t1", "a:f:1", "enter")]);
    await Promise.all([a.until(() => a.messages.length >= 3), b.until(() => b.messages.length >= 3)]);
    expect(a.messages[2]).toEqual(b.messages[2]);
    a.socket.close();
    b.socket.close();
  });
});

describe("trigger state", () => {
  it("is readable from /state and changes on arm and disarm", async () => {
    const { post, get } = await start();
    expect(await get("/state")).toEqual({ armed: null });
    expect(await (await post("/triggers/user%20login/arm")).json()).toEqual({ armed: "user login" });
    expect(await get("/state")).toEqual({ armed: "user login" });
    await post("/triggers/user%20login/disarm");
    expect(await get("/state")).toEqual({ armed: null });
  });
});

describe("the static map", () => {
  const nodes = [
    { id: "login.ts:handleLogin:21", kind: "app", label: "handleLogin", file: "login.ts", line: 21 },
    { id: "postgres", kind: "store", label: "Postgres" },
  ];
  const edges = [{ from: "login.ts:handleLogin:21", to: "postgres", provenance: "static" }];

  it("is stored and replaced as a whole, not merged", async () => {
    const { post, port } = await start();
    await post("/map", { nodes, edges });
    await post("/map", { nodes: [nodes[1]], edges: [] });

    const client = await connect(port);
    await client.until(() => client.messages.length >= 1);
    expect(client.messages[0]).toEqual({ type: "map", nodes: [nodes[1]], edges: [] });
    client.socket.close();
  });

  it("rejects an observed edge: only runtime events may make an edge observed", async () => {
    const { post } = await start();
    const response = await post("/map", { nodes, edges: [{ ...edges[0], provenance: "observed" }] });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/observed/);
  });
});

describe("bad input", () => {
  it.each([
    ["a body that is not an array", { not: "an array" }],
    ["an event with an unknown phase", [{ phase: "boom", triggerId: "t", triggerName: "n", nodeId: "x" }]],
    ["an event without a trigger id", [{ phase: "enter", triggerName: "n", nodeId: "x" }]],
    ["an event with a non-numeric duration", [{ phase: "exit", triggerId: "t", triggerName: "n", nodeId: "x", durationMs: "slow" }]],
  ])("rejects %s with 400 and stores nothing", async (_name, body) => {
    const { post, get } = await start();
    expect((await post("/events", body)).status).toBe(400);
    expect(await get("/triggers")).toEqual([]);
  });

  it("stores none of a batch when one event in it is bad", async () => {
    const { post, get } = await start();
    const response = await post("/events", [event("t1", "a:f:1", "enter"), { phase: "nope" }]);
    expect(response.status).toBe(400);
    expect(await get("/triggers")).toEqual([]);
  });

  it("rejects invalid JSON", async () => {
    const { port } = await start();
    const response = await fetch(`http://localhost:${port}/events`, { method: "POST", body: "{not json" });
    expect(response.status).toBe(400);
  });

  it("answers 404 for unknown routes", async () => {
    const { port } = await start();
    expect((await fetch(`http://localhost:${port}/nope`)).status).toBe(404);
  });
});

describe("spans", () => {
  it("still accepts OTLP spans on /v1/traces", async () => {
    const { post } = await start();
    expect((await post("/v1/traces", { resourceSpans: [] })).status).toBe(200);
  });
});

describe("hops", () => {
  const hop = (extra: Partial<CollectorEvent> = {}): CollectorEvent => ({
    phase: "hop",
    kind: "llm",
    triggerId: "t1",
    triggerName: "user login",
    nodeId: "llm.ts:classifySegment:14",
    target: "llm",
    spanId: "4",
    atMs: 5,
    note: "stub (no API key)",
    ...extra,
  });

  it("are stored and read back in order with their kind, target and note", async () => {
    const { post, get } = await start();
    const sent = [event("t1", "login.ts:handleLogin:21", "enter"), hop(), hop({ kind: "ws", target: "client", note: undefined })];
    await post("/events", sent);
    expect(await get("/triggers/t1/events")).toEqual(sent.map((e) => JSON.parse(JSON.stringify(e))));
  });

  it("are pushed live like any other event", async () => {
    const { port, post } = await start();
    const client = await connect(port);
    await client.until(() => client.messages.length >= 2);
    await post("/events", [hop()]);
    await client.until(() => client.messages.length >= 3);
    expect(client.messages[2]).toEqual({ type: "event", event: hop() });
    client.socket.close();
  });

  it.each([
    ["an unknown kind", hop({ kind: "carrier-pigeon" as never })],
    ["no target", hop({ target: undefined })],
  ])("are rejected with %s", async (_name, bad) => {
    const { post, get } = await start();
    expect((await post("/events", [bad])).status).toBe(400);
    expect(await get("/triggers")).toEqual([]);
  });
});

describe("spans become hops", () => {
  const attribute = (key: string, value: string | number) => ({
    key,
    value: typeof value === "string" ? { stringValue: value } : { doubleValue: value },
  });
  const span = (name: string, attributes: ReturnType<typeof attribute>[]) => ({
    name,
    kind: 3,
    traceId: "abcdef0123456789",
    startTimeUnixNano: "1000000000",
    endTimeUnixNano: "4500000000",
    attributes: attributes,
  });
  const tagged = [
    attribute("capture.trigger_id", "t1"),
    attribute("capture.trigger_name", "user login"),
    attribute("capture.caller_node", "login.ts:validateCredentials:41"),
    attribute("capture.caller_span", "2"),
    attribute("capture.at_ms", 812.5),
  ];
  const traces = (...spans: object[]) => ({ resourceSpans: [{ scopeSpans: [{ spans }] }] });

  it("turns a tagged Postgres query into a db hop from the calling function", async () => {
    const { post, get } = await start();
    await post("/v1/traces", traces(span("pg.query:SELECT", [...tagged, attribute("db.system.name", "postgresql"), attribute("db.query.text", "SELECT 1")])));
    expect(await get("/triggers/t1/events")).toEqual([
      {
        phase: "hop",
        kind: "db",
        triggerId: "t1",
        triggerName: "user login",
        nodeId: "login.ts:validateCredentials:41",
        target: "postgres",
        spanId: "2",
        atMs: 812.5,
        durationMs: 3500,
      },
    ]);
  });

  it("turns a tagged Redis command into a cache hop", async () => {
    const { post, get } = await start();
    await post("/v1/traces", traces(span("set", [...tagged, attribute("db.system.name", "redis"), attribute("db.query.text", "set session:x")])));
    expect(((await get("/triggers/t1/events")) as CollectorEvent[])[0]).toMatchObject({ kind: "cache", target: "redis" });
  });

  it("ignores spans capture did not tag, connection setup spans and non-store spans", async () => {
    const { post, get } = await start();
    await post(
      "/v1/traces",
      traces(
        span("pg.query:SELECT", [attribute("db.system.name", "postgresql"), attribute("db.query.text", "SELECT 1")]), // no trigger
        span("pg.connect", [...tagged, attribute("db.system.name", "postgresql")]), // no query
        span("POST", [...tagged, attribute("http.request.method", "POST")]), // not a store
        span("mongo.find", [...tagged, attribute("db.system.name", "mongodb"), attribute("db.query.text", "find")]), // unsupported store
      ),
    );
    expect(await get("/triggers")).toEqual([]);
  });

  it("pushes the hop to connected clients", async () => {
    const { port, post } = await start();
    const client = await connect(port);
    await client.until(() => client.messages.length >= 2);
    await post("/v1/traces", traces(span("pg.query:SELECT", [...tagged, attribute("db.system.name", "postgresql"), attribute("db.query.text", "SELECT 1")])));
    await client.until(() => client.messages.length >= 3);
    expect(client.messages[2]).toMatchObject({ type: "event", event: { phase: "hop", kind: "db", target: "postgres" } });
    client.socket.close();
  });
});
