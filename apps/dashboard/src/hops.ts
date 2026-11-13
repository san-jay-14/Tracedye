import type { CollectorEvent, HopKind, MapNode } from "collector/src/types";

export interface Call {
  triggerId: string;
  spanId: string;
  parentId?: string;
  nodeId: string;
  input?: unknown;
  output?: unknown;
  atMs?: number;
  durationMs?: number;
  threw?: boolean;
}

// A call that crossed out of the app's code: the request arriving, a store, the LLM, the client.
// Its payload is what went into and came out of the function call it belongs to.
export interface Hop {
  id: string;
  triggerId: string;
  kind: HopKind;
  from: string;
  to: string;
  atMs: number;
  durationMs?: number;
  note?: string;
  before?: unknown;
  after?: unknown;
}

// One crossing of one edge, in the order events arrived. These are what animate and what make edges observed.
export interface Traversal {
  key: string;
  from: string;
  to: string;
  fromKind?: MapNode["kind"];
  toKind?: MapNode["kind"];
}

export interface CallRow extends Call {
  depth: number;
}

export interface CollapsedRow {
  nodeId: string;
  calls: number;
}

const callKey = (triggerId: string, spanId: string) => `${triggerId}/${spanId}`;

const eventKey = (e: CollectorEvent) =>
  [e.phase, e.triggerId, e.spanId ?? "", e.nodeId, e.target ?? "", e.atMs ?? "", e.calls ?? ""].join("/");

// Stored events and live events can overlap while the page connects; keep one of each.
export function dedupeEvents(events: CollectorEvent[]): CollectorEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = eventKey(event);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function callsOf(events: CollectorEvent[]): Map<string, Call> {
  const calls = new Map<string, Call>();
  for (const event of events) {
    if (event.spanId === undefined) continue;
    if (event.phase === "enter") {
      calls.set(callKey(event.triggerId, event.spanId), {
        triggerId: event.triggerId,
        spanId: event.spanId,
        parentId: event.parentId,
        nodeId: event.nodeId,
        input: event.input,
        atMs: event.atMs,
      });
    } else if (event.phase === "exit") {
      const call = calls.get(callKey(event.triggerId, event.spanId));
      if (call) Object.assign(call, { output: event.output, durationMs: event.durationMs, threw: event.threw });
    }
  }
  return calls;
}

const TARGET_KIND: Record<HopKind, MapNode["kind"]> = { http: "app", db: "store", cache: "store", llm: "ai", ws: "external" };

export function traversalsOf(events: CollectorEvent[]): Traversal[] {
  const calls = callsOf(events);
  const traversals: Traversal[] = [];
  for (const event of events) {
    if (event.phase === "enter" && event.parentId !== undefined) {
      const parent = calls.get(callKey(event.triggerId, event.parentId));
      if (parent) traversals.push({ key: eventKey(event), from: parent.nodeId, to: event.nodeId });
    }
    if (event.phase === "hop" && event.target !== undefined && event.kind !== undefined) {
      const isRequest = event.kind === "http";
      traversals.push({
        key: eventKey(event),
        from: event.nodeId,
        to: event.target,
        fromKind: isRequest ? "external" : "app",
        toKind: TARGET_KIND[event.kind],
      });
      // The request reaches the function that handles it: route -> handler.
      const handler = event.spanId === undefined ? undefined : calls.get(callKey(event.triggerId, event.spanId));
      if (isRequest && handler) {
        traversals.push({ key: `${eventKey(event)}/handler`, from: event.target, to: handler.nodeId, fromKind: "app" });
      }
    }
  }
  return traversals;
}

export function hopsOf(events: CollectorEvent[]): Hop[] {
  const calls = callsOf(events);
  const hops: Hop[] = [];
  events.forEach((event, index) => {
    if (event.phase !== "hop" || event.target === undefined || event.kind === undefined) return;
    const call = event.spanId === undefined ? undefined : calls.get(callKey(event.triggerId, event.spanId));
    hops.push({
      id: eventKey(event),
      triggerId: event.triggerId,
      kind: event.kind,
      from: event.nodeId,
      to: event.target,
      atMs: event.atMs ?? index,
      durationMs: event.durationMs,
      note: event.note,
      before: call?.input,
      after: call?.output,
    });
  });
  // Spans reach the collector after the function events around them; time puts them back in order.
  return hops.sort((a, b) => a.atMs - b.atMs);
}

export function latestTriggerId(events: CollectorEvent[]): string | undefined {
  return events.at(-1)?.triggerId;
}

// The function calls of one trigger, depth-first in the order they started.
export function callStackOf(events: CollectorEvent[], triggerId: string): { rows: CallRow[]; collapsed: CollapsedRow[] } {
  const ofTrigger = events.filter((e) => e.triggerId === triggerId);
  const calls = callsOf(ofTrigger);
  const depthOf = (call: Call): number => {
    const parent = call.parentId === undefined ? undefined : calls.get(callKey(triggerId, call.parentId));
    return parent ? depthOf(parent) + 1 : 0;
  };
  const rows = [...calls.values()].map((call) => ({ ...call, depth: depthOf(call) }));
  const collapsed = ofTrigger
    .filter((e) => e.phase === "collapsed" && e.calls !== undefined)
    .map((e) => ({ nodeId: e.nodeId, calls: e.calls as number }));
  return { rows, collapsed };
}

export function labelOf(nodeId: string): string {
  if (nodeId === "client") return "React client";
  return nodeId.split(":").at(-2) ?? nodeId;
}
