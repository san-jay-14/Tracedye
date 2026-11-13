import { createServer } from "node:http";

const PORT = Number(process.env.COLLECTOR_PORT ?? 4318);

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
  value: { stringValue?: string; intValue?: string | number };
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

const server = createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/v1/traces") {
    res.writeHead(404).end();
    return;
  }
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    try {
      const body: OtlpTraces = JSON.parse(Buffer.concat(chunks).toString());
      for (const resource of body.resourceSpans ?? []) {
        for (const scope of resource.scopeSpans ?? []) {
          scope.spans?.forEach(printSpan);
        }
      }
      res.writeHead(200, { "Content-Type": "application/json" }).end("{}");
    } catch {
      res.writeHead(400).end();
    }
  });
});

server.listen(PORT, () => console.log(`collector listening on http://localhost:${PORT}/v1/traces`));
