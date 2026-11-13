import type { CollectorEvent, MapData, MapEdge, MapNode } from "./types";

const PHASES = ["enter", "exit", "collapsed"];
const NODE_KINDS = ["app", "store", "ai", "external"];
// "observed" is deliberately missing: only runtime events may make an edge observed.
const MAP_PROVENANCE = ["static", "inferred"];

export class BadRequest extends Error {}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireString = (value: unknown, what: string): string => {
  if (typeof value !== "string" || value === "") throw new BadRequest(`${what} must be a non-empty string`);
  return value;
};

const optionalString = (value: unknown, what: string): string | undefined => {
  if (value === undefined) return undefined;
  return requireString(value, what);
};

const optionalNumber = (value: unknown, what: string): number | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new BadRequest(`${what} must be a number`);
  return value;
};

export function parseEvents(body: unknown): CollectorEvent[] {
  if (!Array.isArray(body)) throw new BadRequest("body must be an array of events");
  return body.map((raw, i): CollectorEvent => {
    if (!isObject(raw)) throw new BadRequest(`events[${i}] must be an object`);
    if (typeof raw.phase !== "string" || !PHASES.includes(raw.phase)) {
      throw new BadRequest(`events[${i}].phase must be one of ${PHASES.join(", ")}`);
    }
    return {
      phase: raw.phase as CollectorEvent["phase"],
      triggerId: requireString(raw.triggerId, `events[${i}].triggerId`),
      triggerName: requireString(raw.triggerName, `events[${i}].triggerName`),
      nodeId: requireString(raw.nodeId, `events[${i}].nodeId`),
      spanId: optionalString(raw.spanId, `events[${i}].spanId`),
      parentId: optionalString(raw.parentId, `events[${i}].parentId`),
      atMs: optionalNumber(raw.atMs, `events[${i}].atMs`),
      durationMs: optionalNumber(raw.durationMs, `events[${i}].durationMs`),
      threw: raw.threw === undefined ? undefined : raw.threw === true,
      calls: optionalNumber(raw.calls, `events[${i}].calls`),
      input: raw.input,
      output: raw.output,
    };
  });
}

export function parseMap(body: unknown): MapData {
  if (!isObject(body) || !Array.isArray(body.nodes) || !Array.isArray(body.edges)) {
    throw new BadRequest("body must be { nodes: [], edges: [] }");
  }
  const nodes = body.nodes.map((raw, i): MapNode => {
    if (!isObject(raw)) throw new BadRequest(`nodes[${i}] must be an object`);
    if (typeof raw.kind !== "string" || !NODE_KINDS.includes(raw.kind)) {
      throw new BadRequest(`nodes[${i}].kind must be one of ${NODE_KINDS.join(", ")}`);
    }
    return {
      id: requireString(raw.id, `nodes[${i}].id`),
      kind: raw.kind as MapNode["kind"],
      label: requireString(raw.label, `nodes[${i}].label`),
      file: optionalString(raw.file, `nodes[${i}].file`),
      line: optionalNumber(raw.line, `nodes[${i}].line`),
    };
  });
  const edges = body.edges.map((raw, i): MapEdge => {
    if (!isObject(raw)) throw new BadRequest(`edges[${i}] must be an object`);
    if (typeof raw.provenance !== "string" || !MAP_PROVENANCE.includes(raw.provenance)) {
      throw new BadRequest(`edges[${i}].provenance must be static or inferred; observed comes only from runtime events`);
    }
    return {
      from: requireString(raw.from, `edges[${i}].from`),
      to: requireString(raw.to, `edges[${i}].to`),
      provenance: raw.provenance as MapEdge["provenance"],
    };
  });
  return { nodes, edges };
}
