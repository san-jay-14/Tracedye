// Traces Postgres and Redis calls without the project having to set up OpenTelemetry.
// Each span is tagged by capture with the trigger and calling function, then sent to the
// collector, which turns database and cache spans into hops.
import { register } from "node:module";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { CaptureSpanProcessor } from "capture/otel";

register("@opentelemetry/instrumentation/hook.mjs", import.meta.url);

const collector = process.env.TRACEDYE_COLLECTOR_URL ?? "http://localhost:4318";
// The Redis instrumentation only makes a span when something already started one, and there is no
// HTTP instrumentation here to do that, so it is told not to wait for a parent.
new NodeSDK({
  serviceName: "tracedye-traced-app",
  spanProcessors: [
    new CaptureSpanProcessor(),
    // Sent as each span ends, not batched, so hops reach the dashboard while the request is on screen.
    new SimpleSpanProcessor(new OTLPTraceExporter({ url: `${collector}/v1/traces` })),
  ],
  instrumentations: [new PgInstrumentation(), new IORedisInstrumentation({ requireParentSpan: false })],
}).start();
