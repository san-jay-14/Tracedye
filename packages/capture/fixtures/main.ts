import { arm, onEvent, runInTrigger, type FunctionEvent } from "../src/index";
import { outer } from "./chain";

const events: FunctionEvent[] = [];
onEvent((event) => events.push(event));

arm("fixture");
const result = await runInTrigger("t1", () => outer(2));
console.log(JSON.stringify({ result, events }));
