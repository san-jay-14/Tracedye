// Wire types: what capture sends and what the indexer produces. Kept here so the
// collector doesn't depend on those packages.

// One call of a wrapped function, already redacted inside the app process.
export type HopKind = "http" | "db" | "cache" | "llm" | "ws";

export interface CollectorEvent {
  phase: "enter" | "exit" | "collapsed" | "hop";
  triggerId: string;
  triggerName: string;
  nodeId: string; // "file:name:line"
  spanId?: string;
  parentId?: string;
  atMs?: number; // the app's clock, so only differences are meaningful
  durationMs?: number;
  threw?: boolean;
  input?: unknown;
  output?: unknown;
  calls?: number; // collapsed only
  // hop only: a call that left the app's code. nodeId is where it starts, target where it goes,
  // and spanId the function call it belongs to (whose input and output are its payload).
  kind?: HopKind;
  target?: string;
  note?: string;
}

export type Provenance = "observed" | "static" | "inferred";

export interface MapNode {
  id: string;
  kind: "app" | "store" | "ai" | "external";
  label: string;
  file?: string;
  line?: number;
}

export interface MapEdge {
  from: string;
  to: string;
  provenance: Provenance;
}

export interface MapData {
  nodes: MapNode[];
  edges: MapEdge[];
}

export interface TriggerRow {
  id: string;
  name: string;
  startedAt: number;
  events: number;
}

export type StreamMessage =
  | { type: "map"; nodes: MapNode[]; edges: MapEdge[] }
  | { type: "event"; event: CollectorEvent }
  | { type: "trigger-state"; armed: string | null };
