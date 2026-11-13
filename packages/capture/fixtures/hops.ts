import { arm, onEvent, runInTrigger, type CaptureEvent } from "../src/index";
import { CaptureSpanProcessor } from "../src/otel.js";
import { askModel, push, tagSpan } from "./outbound";

const events: CaptureEvent[] = [];
onEvent((event) => events.push(event));

const scenarios: Record<string, unknown> = {};

askModel("x");
push("y");
scenarios.unarmed = events.splice(0);

arm("outbound");
askModel("outside any trigger");
scenarios.outsideTrigger = events.splice(0);

await runInTrigger("t1", async () => {
  askModel("hi");
  push("hello");
});
scenarios.inTrigger = events.splice(0);

const attributes: Record<string, string | number>[] = [];
const span = { setAttributes: (a: Record<string, string | number>) => void attributes.push(a) };
const processor = new CaptureSpanProcessor();
processor.onStart(span); // not inside a wrapped call: must leave the span alone
const untagged = attributes.length;
await runInTrigger("t2", async () => tagSpan(processor, span));
scenarios.spans = { untagged, attributes };

console.log(JSON.stringify(scenarios));
