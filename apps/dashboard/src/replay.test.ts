import type { CollectorEvent } from "collector/src/types";
import { describe, expect, it } from "vitest";
import { buildGraph } from "./graph";
import { callStackOf, hopsOf } from "./hops";
import { enter, login, loginMap } from "./fixtures";
import { buildReplayGraph, eventsAtStep, orderedEvents, stepEdgeIds, stepsOf, triggersOf } from "./replay";

describe("triggersOf", () => {
  it("lists each trigger once, in first-seen order, with its name and event count", () => {
    const other: CollectorEvent = { ...enter("x", "1"), triggerId: "t2", triggerName: "checkout" };
    expect(triggersOf([...login.slice(0, 3), other, ...login.slice(3, 5)])).toEqual([
      { id: "t1", name: "user login", events: 5 },
      { id: "t2", name: "checkout", events: 1 },
    ]);
  });
});

describe("orderedEvents", () => {
  it("puts events in the order they happened, not the order they arrived", () => {
    // the Postgres hop arrives last, as spans do, but happened between validate's enter and exit
    const db = login.find((e) => e.phase === "hop" && e.kind === "db")!;
    const arrived = [...login.filter((e) => e !== db), db];
    expect(orderedEvents(arrived, "t1")).toEqual(login);
  });

  it("keeps only the trigger's own events and leaves untimed ones last", () => {
    const collapsed: CollectorEvent = { phase: "collapsed", triggerId: "t1", triggerName: "user login", nodeId: "tick", calls: 25 };
    const foreign: CollectorEvent = { ...enter("x", "1"), triggerId: "t2" };
    const ordered = orderedEvents([collapsed, foreign, ...login], "t1");
    expect(ordered.at(-1)).toBe(collapsed);
    expect(ordered.some((e) => e.triggerId === "t2")).toBe(false);
  });
});

describe("stepsOf", () => {
  const steps = stepsOf(login);

  it("makes one step per event that sent data along an edge, in order", () => {
    expect(steps.map((s) => s.label)).toEqual([
      "React client → POST /login → handleLogin",
      "handleLogin → validate",
      "validate → postgres",
      "handleLogin → classify",
      "classify → llm",
      "handleLogin → createSession",
      "createSession → redis",
      "handleLogin → notifyClient",
      "notifyClient → React client",
    ]);
  });

  it("gives the request step both of its edges, so both light up together", () => {
    expect(stepEdgeIds(steps[0])).toEqual(["client->POST /login", "POST /login->handleLogin"]);
    expect(stepEdgeIds(undefined)).toEqual([]);
  });

  it("has increasing event positions", () => {
    const positions = steps.map((s) => s.index);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});

describe("eventsAtStep", () => {
  const steps = stepsOf(login);

  it("shows nothing at the start and everything at the end", () => {
    expect(eventsAtStep(login, steps, 0)).toEqual([]);
    expect(eventsAtStep(login, steps, steps.length)).toEqual(login);
    expect(eventsAtStep(login, steps, 99)).toEqual(login);
  });

  it("only ever adds events as the position moves forward", () => {
    let previous = 0;
    for (let position = 0; position <= steps.length; position++) {
      const shown = eventsAtStep(login, steps, position).length;
      expect(shown).toBeGreaterThanOrEqual(previous);
      previous = shown;
    }
  });

  it("reveals a call's return only once the replay has moved past it", () => {
    // step 3 is validate -> postgres: validate is still running
    const during = eventsAtStep(login, steps, 3);
    expect(callStackOf(during, "t1").rows.find((r) => r.nodeId === "validate")?.durationMs).toBeUndefined();
    // step 4 is the next call, so validate has returned by then
    const after = eventsAtStep(login, steps, 4);
    expect(callStackOf(after, "t1").rows.find((r) => r.nodeId === "validate")?.durationMs).toBe(1);
  });

  it("reveals hops one at a time", () => {
    const kinds = (position: number) => hopsOf(eventsAtStep(login, steps, position)).map((h) => h.kind);
    expect(kinds(1)).toEqual(["http"]);
    expect(kinds(3)).toEqual(["http", "db"]);
    expect(kinds(steps.length)).toEqual(["http", "db", "llm", "cache", "ws"]);
  });
});

describe("buildReplayGraph", () => {
  const steps = stepsOf(login);
  const at = (position: number) => buildReplayGraph(loginMap, login, eventsAtStep(login, steps, position));
  const edge = (g: ReturnType<typeof at>["graph"], from: string, to: string) => g.edges.find((e) => e.from === from && e.to === to);

  it("has every node of the trigger from the start, none of them seen yet", () => {
    const { graph } = at(0);
    expect(graph.nodes.map((n) => n.id)).toContain("client");
    expect(graph.nodes.every((n) => !n.seen)).toBe(true);
    expect(graph.edges.every((e) => e.provenance !== "observed")).toBe(true);
  });

  it("does not show an edge found only at runtime until the replay reaches it", () => {
    expect(edge(at(0).graph, "client", "POST /login")).toBeUndefined();
    expect(edge(at(1).graph, "client", "POST /login")?.provenance).toBe("observed");
    expect(edge(at(8).graph, "notifyClient", "client")).toBeUndefined();
    expect(edge(at(9).graph, "notifyClient", "client")?.provenance).toBe("observed");
  });

  it("keeps a map edge static until the replay crosses it", () => {
    expect(edge(at(2).graph, "validate", "postgres")?.provenance).toBe("static");
    expect(edge(at(3).graph, "validate", "postgres")?.provenance).toBe("observed");
  });

  it("ends up the same as the plain graph of the whole trigger", () => {
    const full = buildGraph(loginMap, login);
    const end = at(steps.length).graph;
    expect(end.edges.map((e) => `${e.id}:${e.provenance}`).sort()).toEqual(full.edges.map((e) => `${e.id}:${e.provenance}`).sort());
    expect(end.nodes.filter((n) => n.seen).map((n) => n.id).sort()).toEqual(full.nodes.filter((n) => n.seen).map((n) => n.id).sort());
  });

  it("lays out from the whole trigger, so positions cannot change while stepping", () => {
    expect(at(0).layout).toEqual(at(steps.length).layout);
  });
});
