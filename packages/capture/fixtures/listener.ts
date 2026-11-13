import { arm, onEvent, runInTrigger, type CaptureEvent } from "../src/index";
import { tick } from "./ticks";

// A listener that calls wrapped project code, as a real logger would.
const events: CaptureEvent[] = [];
let listenerCalls = 0;
onEvent((event) => {
  events.push(event);
  listenerCalls++;
  tick(0);
});

arm("listener");
await runInTrigger("t1", async () => tick(1));

console.log(JSON.stringify({ events, listenerCalls }));
