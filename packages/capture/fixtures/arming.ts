import http, { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { arm, disarm, onEvent, type CaptureEvent } from "../src/index";
import { outer } from "./chain";

const events: CaptureEvent[] = [];
onEvent((event) => events.push(event));

const server = createServer((_req, res) => {
  outer(1).then(() => res.end("ok"));
});
await new Promise<void>((resolve) => server.listen(0, resolve));
const url = `http://localhost:${(server.address() as AddressInfo).port}`;

const scenarios: Record<string, CaptureEvent[]> = {};

// One kept-alive connection, so a request after disarming reuses the connection an armed one used.
// (Plain http, not fetch: leaving fetch's sockets open and calling process.exit() can crash Node on Windows.)
const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });

function get(headers: Record<string, string>) {
  return new Promise<void>((resolve, reject) => {
    http
      .get(url, { agent, headers }, (res) => {
        res.resume();
        res.on("end", resolve);
      })
      .on("error", reject);
  });
}

async function request(name: string, headers: Record<string, string> = {}) {
  const before = events.length;
  await get(headers);
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
agent.destroy();
server.closeAllConnections();
server.close();
