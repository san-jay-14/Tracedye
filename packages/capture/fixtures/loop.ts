import { arm, onEvent, runInTrigger, type CaptureEvent } from "../src/index";
import { runMany } from "./ticks";

const events: CaptureEvent[] = [];
onEvent((event) => events.push(event));

arm("loop");
const total = await runInTrigger("t1", async () => runMany(25));

console.log(JSON.stringify({ total, events }));
