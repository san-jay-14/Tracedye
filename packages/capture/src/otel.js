// Plain JavaScript (types in JSDoc, checked by tsc), see runtime.js.
import { performance } from "node:perf_hooks";
import { currentCall } from "./runtime.js";

/**
 * An OpenTelemetry span processor that tags each span started inside a wrapped function
 * call with the trigger and the calling function, so the collector can turn Postgres and
 * Redis spans into hops. Spans started outside a trigger are left alone.
 */
export class CaptureSpanProcessor {
  /** @param {{ setAttributes(attributes: Record<string, string | number>): unknown }} span */
  onStart(span) {
    const call = currentCall();
    if (!call) return;
    span.setAttributes({
      "capture.trigger_id": call.triggerId,
      "capture.trigger_name": call.triggerName,
      "capture.caller_node": call.nodeId,
      "capture.caller_span": call.spanId,
      "capture.at_ms": performance.now(), // same clock as function events, so hops sort among them
    });
  }

  onEnd() {}

  shutdown() {
    return Promise.resolve();
  }

  forceFlush() {
    return Promise.resolve();
  }
}
