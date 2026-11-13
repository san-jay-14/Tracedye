import { arm, onEvent, runInTrigger, type CaptureEvent } from "../src/index";
import { buildQuery } from "./lazy";

const events: CaptureEvent[] = [];
onEvent((event) => events.push(event));
arm("thenable");

const query = runInTrigger("t1", () => buildQuery("users"));
// Still a builder that has not run: capture must not have called .then
console.log(JSON.stringify({ isQuery: query.constructor.name, runs: query.runs, canChain: typeof query.where, events: events.length }));
