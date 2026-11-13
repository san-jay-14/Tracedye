import { register } from "node:module";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";

register("@opentelemetry/instrumentation/hook.mjs", import.meta.url);

// Loaded with `--import` so it runs before express, pg and ioredis are imported.
const sdk = new NodeSDK({
  serviceName: "sample-app",
  traceExporter: new OTLPTraceExporter({
    url: process.env.COLLECTOR_URL ?? "http://localhost:4318/v1/traces",
  }),
  instrumentations: [new HttpInstrumentation(), new PgInstrumentation(), new IORedisInstrumentation()],
});

sdk.start();
