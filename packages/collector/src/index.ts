import { startCollector } from "./server";

const port = Number(process.env.COLLECTOR_PORT ?? 4318);
const dbPath = process.env.COLLECTOR_DB ?? "collector.db";

const collector = await startCollector({ port, dbPath });
console.log(`collector on http://localhost:${collector.port} (events, map, triggers, /stream; spans at /v1/traces), db ${dbPath}`);
