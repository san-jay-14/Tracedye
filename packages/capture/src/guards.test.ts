import { describe, expect, it } from "vitest";
import { runFixture } from "./run-fixture";
import type { CaptureEvent, CollapsedEvent, FunctionEvent, HopEvent } from "./runtime.js";

describe("secrets never leave the process", () => {
  const events = runFixture<FunctionEvent[]>("secrets");
  const enterOf = (name: string) => events.find((e) => e.phase === "enter" && e.nodeId.includes(`:${name}:`))!;
  const exitOf = (name: string) => events.find((e) => e.phase === "exit" && e.nodeId.includes(`:${name}:`))!;

  it("emits none of the secret values anywhere in any event", () => {
    const everything = JSON.stringify(events);
    for (const secret of ["hunter2", "tok_123", "tok_a", "tok_b", "hash-abc", "Bearer zzz", "123-45-6789", "hashed:"]) {
      expect(everything).not.toContain(secret);
    }
  });

  it("redacts a password passed as a plain positional argument, keeping the rest", () => {
    expect(enterOf("login").input).toEqual({
      email: "a@b.c",
      password: "[REDACTED]",
      options: { token: "[REDACTED]", note: "hello" },
    });
  });

  it("redacts secrets in return values and keeps the rest", () => {
    expect(exitOf("login").output).toEqual({
      id: 1,
      email: "a@b.c",
      password_hash: "[REDACTED]",
      profile: { Authorization: "[REDACTED]", plan: "pro", note: "hello" },
    });
  });

  it("redacts the arguments and return value of a function named after a secret", () => {
    expect(enterOf("hashPassword").input).toEqual({ plain: "[REDACTED]" });
    expect(exitOf("hashPassword").output).toBe("[REDACTED]");
  });

  it("looks inside a destructured parameter", () => {
    expect(enterOf("register").input).toEqual({ arg0: { email: "a@b.c", password: "[REDACTED]" } });
  });

  it("applies keys added with configure()", () => {
    expect(exitOf("register").output).toEqual({ email: "a@b.c", ssn: "[REDACTED]", length: 7 });
  });

  it("redacts a rest parameter named like a secret", () => {
    expect(enterOf("collect").input).toEqual({ tokens: "[REDACTED]" });
  });

  it("caps oversized payloads at the configured size", () => {
    const { input } = enterOf("big");
    expect(typeof input).toBe("string");
    expect(input).toMatch(/\[truncated, \d+ bytes\]$/);
    expect((input as string).length).toBeLessThan(300);
  });
});

describe("call-count collapsing", () => {
  const { total, events } = runFixture<{ total: number; events: CaptureEvent[] }>("loop");
  const enters = events.filter((e): e is FunctionEvent => e.phase === "enter" && e.nodeId.includes(":tick:"));
  const collapsed = events.filter((e): e is CollapsedEvent => e.phase === "collapsed");

  it("does not change the result", () => {
    expect(total).toBe(25);
  });

  it("emits only the first 10 calls of a function in a trigger", () => {
    expect(enters).toHaveLength(10);
  });

  it("reports the real call count once, after the outermost call returns", () => {
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]).toMatchObject({ triggerId: "t1", calls: 25 });
    expect(collapsed[0].nodeId).toContain(":tick:");
    expect(events.at(-1)).toBe(collapsed[0]);
  });

  it("keeps the emitted calls attached to their caller", () => {
    const runMany = events.find((e): e is FunctionEvent => e.phase === "enter" && e.nodeId.includes(":runMany:"))!;
    expect(enters.every((e) => e.parentId === runMany.spanId)).toBe(true);
  });

  it("emits no collapsed event when nothing was called often", () => {
    const small = runFixture<{ events: CaptureEvent[] }>("main").events;
    expect(small.some((e) => e.phase === "collapsed")).toBe(false);
  });
});

describe("listeners", () => {
  it("are not traced when they call wrapped code, so they can't recurse", () => {
    const { events, listenerCalls } = runFixture<{ events: CaptureEvent[]; listenerCalls: number }>("listener");
    expect(events).toHaveLength(2); // enter and exit of the one tick(1) in the trigger
    expect(listenerCalls).toBe(2);
  });
});

describe("production refusal", () => {
  it("refuses to start under NODE_ENV=production", () => {
    expect(() => runFixture("main", { NODE_ENV: "production" })).toThrow(/refuses to run when NODE_ENV=production/);
  });

  it("starts normally otherwise", () => {
    expect(() => runFixture("main", { NODE_ENV: "development" })).not.toThrow();
  });
});

describe("request summary", () => {
  const events = runFixture<CaptureEvent[]>("intake");
  const input = (events.find((e) => e.phase === "enter" && e.nodeId.includes(":handleRequest:")) as FunctionEvent).input as {
    req: Record<string, unknown>;
  };

  it("shows method, path, query, headers, body and address", () => {
    expect(input.req).toMatchObject({
      method: "POST",
      path: "/login",
      query: { token: "[REDACTED]", page: "2" },
      body: { email: "a@b.c", password: "[REDACTED]" },
    });
    expect((input.req.headers as Record<string, unknown>)["content-type"]).toBe("application/json");
    expect(typeof input.req.ip).toBe("string");
  });

  it("redacts secrets in headers, query and body, and leaks nothing anywhere", () => {
    expect(input.req.headers).toMatchObject({ authorization: "[REDACTED]", cookie: "[REDACTED]" });
    const everything = JSON.stringify(events);
    for (const secret of ["qs-secret", "hdr-secret", "cookie-secret", "hunter2"]) {
      expect(everything).not.toContain(secret);
    }
  });
});

describe("hops", () => {
  const scenarios = runFixture<{
    unarmed: CaptureEvent[];
    outsideTrigger: CaptureEvent[];
    inTrigger: CaptureEvent[];
    spans: { untagged: number; attributes: Record<string, string | number>[] };
  }>("hops");

  it("emit nothing while unarmed or outside a trigger", () => {
    expect(scenarios.unarmed).toEqual([]);
    expect(scenarios.outsideTrigger).toEqual([]);
  });

  it("report a boundary call as a hop from the calling function, with its note", () => {
    const hops = scenarios.inTrigger.filter((e): e is HopEvent => e.phase === "hop");
    const enters = scenarios.inTrigger.filter((e): e is FunctionEvent => e.phase === "enter");
    const askModel = enters.find((e) => e.nodeId.includes(":askModel:"))!;
    const push = enters.find((e) => e.nodeId.includes(":push:"))!;

    expect(hops).toHaveLength(2);
    expect(hops[0]).toMatchObject({ kind: "llm", target: "llm", nodeId: askModel.nodeId, spanId: askModel.spanId, note: "stub", triggerId: "t1" });
    expect(hops[1]).toMatchObject({ kind: "ws", target: "client", nodeId: push.nodeId, spanId: push.spanId });
    expect(hops[1].note).toBeUndefined();
  });

  it("still returns what the wrapped call returns", () => {
    const exit = scenarios.inTrigger.find((e): e is FunctionEvent => e.phase === "exit" && e.nodeId.includes(":askModel:"))!;
    expect(exit.output).toBe("echo:hi");
  });

  it("tag a span started inside a wrapped call with the trigger and caller, and only then", () => {
    expect(scenarios.spans.untagged).toBe(0);
    expect(scenarios.spans.attributes).toHaveLength(1);
    expect(scenarios.spans.attributes[0]).toMatchObject({ "capture.trigger_id": "t2", "capture.trigger_name": "outbound" });
    expect(String(scenarios.spans.attributes[0]["capture.caller_node"])).toContain(":tagSpan:");
    expect(typeof scenarios.spans.attributes[0]["capture.caller_span"]).toBe("string");
    expect(typeof scenarios.spans.attributes[0]["capture.at_ms"]).toBe("number");
  });
});

describe("lazy thenables", () => {
  const result = runFixture<{ isQuery: string; runs: number; canChain: string; events: number }>("thenable");

  it("are returned as they are: capture does not call .then on something that is not a Promise", () => {
    expect(result.isQuery).toBe("Query");
    expect(result.runs).toBe(0);
    expect(result.canChain).toBe("function");
  });

  it("still records the call", () => {
    expect(result.events).toBe(2);
  });
});
