import http, { createServer } from "node:http";
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
await new Promise<void>((resolve, reject) => {
  const request = http.request(
    `http://localhost:${port}/login?token=qs-secret&page=2`,
    {
      method: "POST",
      agent: false,
      headers: { "content-type": "application/json", authorization: "Bearer hdr-secret", cookie: "sid=cookie-secret" },
    },
    (res) => {
      res.resume();
      res.on("end", resolve);
    },
  );
  request.on("error", reject);
  request.end(JSON.stringify({ email: "a@b.c", password: "hunter2" }));
});

console.log(JSON.stringify(events));
server.closeAllConnections();
server.close();
