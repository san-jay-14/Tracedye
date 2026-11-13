import { onEvent, type FunctionEvent } from "../src/index";
import { outer } from "./chain";

const events: FunctionEvent[] = [];
onEvent((event) => events.push(event));

const result = await outer(2);
console.log(JSON.stringify({ result, events }));
