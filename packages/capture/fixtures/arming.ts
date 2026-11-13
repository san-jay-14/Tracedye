import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { arm, disarm, onEvent, type FunctionEvent } from "../src/index";
import { outer } from "./chain";

const events: FunctionEvent[] = [];
onEvent((event) => events.push(event));

const server = createServer((_req, res) => {
  outer(1).then(() => res.end("ok"));
});
await new Promise<void>((resolve) => server.listen(0, resolve));
const url = `http://localhost:${(server.address() as AddressInfo).port}`;

const scenarios: Record<string, FunctionEvent[]> = {};

async function request(name: string, headers: Record<string, string> = {}) {
  const before = events.length;
  await (await fetch(url, { headers })).text();
  scenarios[name] = events.slice(before);
}

await request("unarmed");

arm("user login");
const before = events.length;
await outer(1); // armed, but not inside a request, so not part of any trigger
scenarios.outsideRequest = events.slice(before);

await request("armed");
await request("armedAgain");
await request("withHeader", { "x-trigger-id": "custom-1" });
await request("badHeader", { "x-trigger-id": "not a safe id!" });

disarm();
await request("disarmed");

console.log(JSON.stringify(scenarios));
process.exit(0);
