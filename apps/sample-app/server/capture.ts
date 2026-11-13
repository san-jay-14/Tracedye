// Loaded with `--import`, after otel.ts. Wraps this app's functions and prints each
// enter and exit. Day 7 sends these events to the collector instead.
import "capture/register";
import { onEvent } from "capture";

onEvent((event) => {
  const detail = event.phase === "exit" ? ` ${event.durationMs?.toFixed(1)}ms${event.threw ? " threw" : ""}` : "";
  console.log(`[fn] ${event.phase.padEnd(5)} span=${event.spanId} parent=${event.parentId ?? "-"} ${event.nodeId}${detail}`);
});
