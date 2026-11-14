import type { DatabaseSync } from "node:sqlite";
import { loadSqlite } from "./sqlite";
import type { CollectorEvent, MapData, MapEdge, MapNode, TriggerRow } from "./types";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS triggers (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    started_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS events (
    seq         INTEGER PRIMARY KEY AUTOINCREMENT,
    trigger_id  TEXT NOT NULL REFERENCES triggers(id),
    phase       TEXT NOT NULL,
    node_id     TEXT NOT NULL,
    span_id     TEXT,
    parent_id   TEXT,
    at_ms       REAL,
    duration_ms REAL,
    threw       INTEGER,
    input       TEXT,
    output      TEXT,
    calls       INTEGER,
    kind        TEXT,
    target      TEXT,
    note        TEXT
  );
  CREATE INDEX IF NOT EXISTS events_by_trigger ON events(trigger_id, seq);
  CREATE TABLE IF NOT EXISTS map_nodes (
    id    TEXT PRIMARY KEY,
    kind  TEXT NOT NULL,
    label TEXT NOT NULL,
    file  TEXT,
    line  INTEGER
  );
  CREATE TABLE IF NOT EXISTS map_edges (
    from_id    TEXT NOT NULL,
    to_id      TEXT NOT NULL,
    provenance TEXT NOT NULL,
    PRIMARY KEY (from_id, to_id)
  );
`;

export interface Store {
  addEvents(events: CollectorEvent[]): void;
  listTriggers(): TriggerRow[];
  getTriggerEvents(triggerId: string): CollectorEvent[] | undefined;
  replaceMap(map: MapData): void;
  getMap(): MapData;
  close(): void;
}

function inTransaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec("BEGIN");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

// Payloads arrive already redacted by the capture package; the store keeps them as given.
export function openStore(path: string): Store {
  const db = new (loadSqlite().DatabaseSync)(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);

  const insertTrigger = db.prepare("INSERT OR IGNORE INTO triggers (id, name, started_at) VALUES (?, ?, ?)");
  const insertEvent = db.prepare(`
    INSERT INTO events (trigger_id, phase, node_id, span_id, parent_id, at_ms, duration_ms, threw, input, output, calls, kind, target, note)
    VALUES (@triggerId, @phase, @nodeId, @spanId, @parentId, @atMs, @durationMs, @threw, @input, @output, @calls, @kind, @target, @note)
  `);
  const insertNode = db.prepare("INSERT INTO map_nodes (id, kind, label, file, line) VALUES (@id, @kind, @label, @file, @line)");
  const insertEdge = db.prepare("INSERT INTO map_edges (from_id, to_id, provenance) VALUES (@from, @to, @provenance)");

  const addEvents = (events: CollectorEvent[]) =>
    inTransaction(db, () => {
    for (const event of events) {
      insertTrigger.run(event.triggerId, event.triggerName, Date.now());
      insertEvent.run({
        triggerId: event.triggerId,
        phase: event.phase,
        nodeId: event.nodeId,
        spanId: event.spanId ?? null,
        parentId: event.parentId ?? null,
        atMs: event.atMs ?? null,
        durationMs: event.durationMs ?? null,
        threw: event.threw === undefined ? null : Number(event.threw),
        input: event.input === undefined ? null : JSON.stringify(event.input),
        output: event.output === undefined ? null : JSON.stringify(event.output),
        calls: event.calls ?? null,
        kind: event.kind ?? null,
        target: event.target ?? null,
        note: event.note ?? null,
      });
    }
    });

  const replaceMap = (map: MapData) =>
    inTransaction(db, () => {
      db.exec("DELETE FROM map_edges; DELETE FROM map_nodes;");
      for (const node of map.nodes) {
        insertNode.run({ id: node.id, kind: node.kind, label: node.label, file: node.file ?? null, line: node.line ?? null });
      }
      for (const edge of map.edges) insertEdge.run({ from: edge.from, to: edge.to, provenance: edge.provenance });
    });

  return {
    addEvents,
    replaceMap,

    listTriggers() {
      return db
        .prepare(
          `SELECT t.id, t.name, t.started_at AS startedAt, COUNT(e.seq) AS events
           FROM triggers t LEFT JOIN events e ON e.trigger_id = t.id
           GROUP BY t.id ORDER BY t.started_at, t.rowid`,
        )
        .all() as unknown as TriggerRow[];
    },

    getTriggerEvents(triggerId) {
      const trigger = db.prepare("SELECT id, name FROM triggers WHERE id = ?").get(triggerId) as unknown as
        | { id: string; name: string }
        | undefined;
      if (!trigger) return undefined;
      const rows = db.prepare("SELECT * FROM events WHERE trigger_id = ? ORDER BY seq").all(triggerId) as unknown as EventRow[];
      return rows.map((row) => toEvent(row, trigger.name));
    },

    getMap() {
      const nodes = db.prepare("SELECT id, kind, label, file, line FROM map_nodes ORDER BY id").all() as unknown as NodeRow[];
      const edges = db
        .prepare("SELECT from_id AS 'from', to_id AS 'to', provenance FROM map_edges ORDER BY from_id, to_id")
        .all() as unknown as MapEdge[];
      return { nodes: nodes.map(toNode), edges };
    },

    close() {
      db.close();
    },
  };
}

interface EventRow {
  trigger_id: string;
  phase: CollectorEvent["phase"];
  node_id: string;
  span_id: string | null;
  parent_id: string | null;
  at_ms: number | null;
  duration_ms: number | null;
  threw: number | null;
  input: string | null;
  output: string | null;
  calls: number | null;
  kind: CollectorEvent["kind"] | null;
  target: string | null;
  note: string | null;
}

interface NodeRow {
  id: string;
  kind: MapNode["kind"];
  label: string;
  file: string | null;
  line: number | null;
}

// Only fields that were present come back, so an event reads back as it was sent.
function toEvent(row: EventRow, triggerName: string): CollectorEvent {
  const event: CollectorEvent = { phase: row.phase, triggerId: row.trigger_id, triggerName, nodeId: row.node_id };
  if (row.span_id !== null) event.spanId = row.span_id;
  if (row.parent_id !== null) event.parentId = row.parent_id;
  if (row.at_ms !== null) event.atMs = row.at_ms;
  if (row.duration_ms !== null) event.durationMs = row.duration_ms;
  if (row.threw !== null) event.threw = row.threw === 1;
  if (row.input !== null) event.input = JSON.parse(row.input);
  if (row.output !== null) event.output = JSON.parse(row.output);
  if (row.calls !== null) event.calls = row.calls;
  if (row.kind !== null) event.kind = row.kind;
  if (row.target !== null) event.target = row.target;
  if (row.note !== null) event.note = row.note;
  return event;
}

function toNode(row: NodeRow): MapNode {
  const node: MapNode = { id: row.id, kind: row.kind, label: row.label };
  if (row.file !== null) node.file = row.file;
  if (row.line !== null) node.line = row.line;
  return node;
}
