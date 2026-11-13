// Dev wiring between capture and the collector, until capture ships its own exporter:
// events are batched to POST /events, and the armed state is polled from GET /state.
import { arm, disarm, onEvent, type CaptureEvent } from "capture";

const COLLECTOR_URL = process.env.COLLECTOR_URL ?? "http://localhost:4318";
const FLUSH_MS = 100;
const POLL_MS = 500;

let buffer: CaptureEvent[] = [];
let flushTimer: NodeJS.Timeout | undefined;
let warned = false;

function warnOnce(message: string) {
  if (warned) return;
  warned = true;
  console.warn(`[capture] ${message}`);
}

async function flush() {
  flushTimer = undefined;
  const batch = buffer;
  buffer = [];
  try {
    const response = await fetch(`${COLLECTOR_URL}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(batch),
    });
    if (!response.ok) warnOnce(`collector rejected events: ${response.status}`);
  } catch {
    warnOnce(`collector not reachable at ${COLLECTOR_URL}; dropping events`);
  }
}

onEvent((event) => {
  buffer.push(event);
  flushTimer ??= setTimeout(flush, FLUSH_MS);
});

let armedName: string | null = null;

async function syncArmedState() {
  let next: string | null = null;
  try {
    const response = await fetch(`${COLLECTOR_URL}/state`);
    next = ((await response.json()) as { armed: string | null }).armed;
  } catch {
    // Collector unreachable: stay disarmed rather than pay for events nobody receives.
  }
  if (next === armedName) return;
  armedName = next;
  if (next === null) disarm();
  else arm(next);
  console.log(`[capture] ${next === null ? "disarmed" : `armed "${next}"`}`);
}

setInterval(syncArmedState, POLL_MS).unref();
