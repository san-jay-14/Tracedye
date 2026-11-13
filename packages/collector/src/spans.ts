// OTLP/JSON spans from the OpenTelemetry exporter. Every span is printed; spans that capture
// tagged with a trigger and a calling function (database and cache calls) also become hops.
import type { CollectorEvent } from "./types";

// Only these attributes are printed, so raw payloads never reach the console.
const PRINTED_ATTRIBUTES = [
  "http.request.method",
  "url.path",
  "http.response.status_code",
  "db.system.name",
  "db.namespace",
  "db.query.text",
  "db.statement",
];

const SPAN_KINDS = ["unspecified", "internal", "server", "client", "producer", "consumer"];

interface OtlpAttribute {
  key: string;
  value: { stringValue?: string; intValue?: string | number; doubleValue?: number };
}

interface OtlpSpan {
  name: string;
  kind: number;
  traceId: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes?: OtlpAttribute[];
}

interface OtlpTraces {
  resourceSpans?: { scopeSpans?: { spans?: OtlpSpan[] }[] }[];
}

function printSpan(span: OtlpSpan): void {
  const durationMs = (Number(BigInt(span.endTimeUnixNano) - BigInt(span.startTimeUnixNano)) / 1e6).toFixed(1);
  const attributes = (span.attributes ?? [])
    .filter((a) => PRINTED_ATTRIBUTES.includes(a.key))
    .map((a) => `${a.key}=${a.value.stringValue ?? a.value.intValue}`)
    .join(" ");
  const kind = SPAN_KINDS[span.kind] ?? "unspecified";
  console.log(`[span] trace=${span.traceId.slice(0, 8)} ${kind} ${span.name} ${durationMs}ms ${attributes}`);
}

const attributeValue = (span: OtlpSpan, key: string): string | number | undefined => {
  const value = span.attributes?.find((a) => a.key === key)?.value;
  return value?.stringValue ?? value?.doubleValue ?? (value?.intValue === undefined ? undefined : Number(value.intValue));
};

// Which map node and hop kind a database system is. Only spans that run a query or command
// count: connection setup spans are not a hop to the store.
const STORES: Record<string, { target: string; kind: "db" | "cache" }> = {
  postgresql: { target: "postgres", kind: "db" },
  redis: { target: "redis", kind: "cache" },
};

export function spansToHops(body: OtlpTraces): CollectorEvent[] {
  const hops: CollectorEvent[] = [];
  for (const resource of body.resourceSpans ?? []) {
    for (const scope of resource.scopeSpans ?? []) {
      for (const span of scope.spans ?? []) {
        const triggerId = attributeValue(span, "capture.trigger_id");
        const callerNode = attributeValue(span, "capture.caller_node");
        const system = attributeValue(span, "db.system.name") ?? attributeValue(span, "db.system");
        const isCommand = attributeValue(span, "db.query.text") !== undefined || attributeValue(span, "db.statement") !== undefined;
        const store = typeof system === "string" ? STORES[system] : undefined;
        if (typeof triggerId !== "string" || typeof callerNode !== "string" || !store || !isCommand) continue;

        const atMs = attributeValue(span, "capture.at_ms");
        const callerSpan = attributeValue(span, "capture.caller_span");
        hops.push({
          phase: "hop",
          kind: store.kind,
          triggerId,
          triggerName: String(attributeValue(span, "capture.trigger_name") ?? triggerId),
          nodeId: callerNode,
          target: store.target,
          spanId: callerSpan === undefined ? undefined : String(callerSpan),
          atMs: typeof atMs === "number" ? atMs : undefined,
          durationMs: Number(BigInt(span.endTimeUnixNano) - BigInt(span.startTimeUnixNano)) / 1e6,
        });
      }
    }
  }
  return hops;
}

export function printSpans(body: OtlpTraces): void {
  for (const resource of body.resourceSpans ?? []) {
    for (const scope of resource.scopeSpans ?? []) {
      scope.spans?.forEach(printSpan);
    }
  }
}
