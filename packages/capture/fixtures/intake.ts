import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { arm, onEvent, type CaptureEvent } from "../src/index";
import { handleRequest } from "./accounts";

const events: CaptureEvent[] = [];
onEvent((event) => events.push(event));

// Like Express with express.json(): the body is parsed and put on req.body.
const server = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  (req as unknown as { body: unknown }).body = JSON.parse(raw);
  handleRequest(req);
  res.end("ok");
});
await new Promise<void>((resolve) => server.listen(0, resolve));
const port = (server.address() as AddressInfo).port;

arm("intake");
await (
  await fetch(`http://localhost:${port}/login?token=qs-secret&page=2`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer hdr-secret", cookie: "sid=cookie-secret" },
    body: JSON.stringify({ email: "a@b.c", password: "hunter2" }),
  })
).text();

console.log(JSON.stringify(events));
process.exit(0);
