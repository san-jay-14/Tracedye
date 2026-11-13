import { arm, onEvent, runInTrigger, type CaptureEvent } from "../src/index";
import { outer } from "./chain";

const events: CaptureEvent[] = [];
onEvent((event) => events.push(event));

arm("fixture");
const result = await runInTrigger("t1", () => outer(2));
console.log(JSON.stringify({ result, events }));
