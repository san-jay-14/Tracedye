// Plain JavaScript (types in JSDoc, checked by tsc), see runtime.js.
// A preload that sends capture's events to the collector and follows its armed state:
// events are batched to POST /events, and GET /state is polled to arm and disarm.
// Collector address: TRACEDYE_COLLECTOR_URL, default http://localhost:4318.
import { arm, disarm, onEvent } from "./runtime.js";

const COLLECTOR = process.env.TRACEDYE_COLLECTOR_URL ?? "http://localhost:4318";
const FLUSH_MS = 100;
const POLL_MS = 500;

/** @type {import("./runtime.js").CaptureEvent[]} */
let buffer = [];
/** @type {ReturnType<typeof setTimeout> | undefined} */
let flushTimer;
let warned = false;

/** @param {string} message */
function warnOnce(message) {
  if (warned) return;
  warned = true;
  console.warn(`[capture] ${message}`);
}

async function flush() {
  flushTimer = undefined;
  const batch = buffer;
  buffer = [];
  try {
    const response = await fetch(`${COLLECTOR}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(batch),
    });
    if (!response.ok) warnOnce(`collector rejected events: ${response.status}`);
  } catch {
    warnOnce(`collector not reachable at ${COLLECTOR}; dropping events`);
  }
}

onEvent((event) => {
  buffer.push(event);
  flushTimer ??= setTimeout(flush, FLUSH_MS);
});

/** @type {string | null} */
let armedName = null;

async function syncArmedState() {
  /** @type {string | null} */
  let next = null;
  try {
    const response = await fetch(`${COLLECTOR}/state`);
    next = /** @type {{ armed: string | null }} */ (await response.json()).armed;
  } catch {
    // Collector unreachable: stay disarmed rather than pay for events nobody receives.
  }
  if (next === armedName) return;
  armedName = next;
  if (next === null) disarm();
  else arm(next);
}

setInterval(syncArmedState, POLL_MS).unref();
