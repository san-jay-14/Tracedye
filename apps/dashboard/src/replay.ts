import type { CollectorEvent, MapData } from "collector/src/types";
import { buildGraph, type Graph } from "./graph";
import { edgeId, labelOf, traversalsOf, type Traversal } from "./hops";

export interface TriggerInfo {
  id: string;
  name: string;
  events: number;
}

// One step of a replay: an event that sent data along one or more edges.
export interface Step {
  index: number; // position of the event in the trigger's ordered events
  traversals: Traversal[];
  label: string;
}

// Distinct triggers, in the order they first appear.
export function triggersOf(events: CollectorEvent[]): TriggerInfo[] {
  const byId = new Map<string, TriggerInfo>();
  for (const event of events) {
    const info = byId.get(event.triggerId) ?? { id: event.triggerId, name: event.triggerName, events: 0 };
    info.events++;
    byId.set(event.triggerId, info);
  }
  return [...byId.values()];
}

// A trigger's events in the order things happened. Arrival order is not enough: a database
// span reaches the collector after the calls around it. Events without a time stay last.
export function orderedEvents(events: CollectorEvent[], triggerId: string): CollectorEvent[] {
  const own = events.filter((e) => e.triggerId === triggerId);
  const timed = own.filter((e) => e.atMs !== undefined).sort((a, b) => (a.atMs as number) - (b.atMs as number));
  return [...timed, ...own.filter((e) => e.atMs === undefined)];
}

export function stepsOf(ordered: CollectorEvent[]): Step[] {
  const byEvent = new Map<number, Traversal[]>();
  for (const traversal of traversalsOf(ordered)) {
    byEvent.set(traversal.index, [...(byEvent.get(traversal.index) ?? []), traversal]);
  }
  return [...byEvent.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, traversals]) => {
      const chain = [traversals[0].from, ...traversals.map((t) => t.to)];
      return { index, traversals, label: chain.map(labelOf).join(" → ") };
    });
}

// What has happened once `position` steps have been shown: every event up to and including that
// step's event. A call that returns right after a step therefore shows as returned from the next one.
// 0 is before the start; the last step shows everything, including the final returns.
export function eventsAtStep(ordered: CollectorEvent[], steps: Step[], position: number): CollectorEvent[] {
  if (position <= 0) return [];
  const end = position >= steps.length ? ordered.length : steps[position - 1].index + 1;
  return ordered.slice(0, end);
}

export function stepEdgeIds(step: Step | undefined): string[] {
  return step ? step.traversals.map((t) => edgeId(t.from, t.to)) : [];
}

// Every node the trigger touches is on the canvas from the start, so nothing jumps while stepping,
// but a node only counts as seen, and an edge as observed, once the replay has reached it.
export function buildReplayGraph(map: MapData, fullEvents: CollectorEvent[], shownEvents: CollectorEvent[]): { graph: Graph; layout: Graph } {
  const layout = buildGraph(map, fullEvents);
  const shown = buildGraph(map, shownEvents);
  const seen = new Set(shown.nodes.filter((n) => n.seen).map((n) => n.id));
  return { graph: { nodes: layout.nodes.map((n) => ({ ...n, seen: seen.has(n.id) })), edges: shown.edges }, layout };
}
