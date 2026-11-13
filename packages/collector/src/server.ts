import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import { printSpans, spansToHops } from "./spans";
import { openStore } from "./store";
import type { StreamMessage } from "./types";
import { BadRequest, parseEvents, parseMap } from "./validate";

const MAX_BODY_BYTES = 5 * 1024 * 1024;

export interface Collector {
  port: number;
  close(): Promise<void>;
}

export async function startCollector(options: { port: number; dbPath: string }): Promise<Collector> {
  const store = openStore(options.dbPath);
  let armed: string | null = null;

  const server = createServer((req, res) => {
    handle(req, res).catch((error) => {
      if (error instanceof BadRequest) return send(res, 400, { error: error.message });
      console.error(error);
      send(res, 500, { error: "internal error" });
    });
  });

  const wss = new WebSocketServer({ server, path: "/stream" });
  const broadcast = (message: StreamMessage) => {
    const text = JSON.stringify(message);
    for (const client of wss.clients) if (client.readyState === WebSocket.OPEN) client.send(text);
  };
  wss.on("connection", (socket) => {
    // A new dashboard starts from the current map and state, then follows live events.
    socket.send(JSON.stringify({ type: "map", ...store.getMap() } satisfies StreamMessage));
    socket.send(JSON.stringify({ type: "trigger-state", armed } satisfies StreamMessage));
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parts = new URL(req.url ?? "/", "http://localhost").pathname.split("/").filter(Boolean);
    const route = `${req.method} /${parts.join("/")}`;

    if (route === "POST /events") {
      const events = parseEvents(await readJson(req));
      store.addEvents(events);
      for (const event of events) broadcast({ type: "event", event });
      console.log(`[collector] stored ${events.length} events`);
      return send(res, 200, { stored: events.length });
    }

    if (route === "POST /map") {
      const map = parseMap(await readJson(req));
      store.replaceMap(map);
      broadcast({ type: "map", ...map });
      console.log(`[collector] map: ${map.nodes.length} nodes, ${map.edges.length} edges`);
      return send(res, 200, { nodes: map.nodes.length, edges: map.edges.length });
    }

    if (parts[0] === "triggers" && req.method === "POST" && parts.length === 3 && (parts[2] === "arm" || parts[2] === "disarm")) {
      armed = parts[2] === "arm" ? decodeURIComponent(parts[1]) : null;
      broadcast({ type: "trigger-state", armed });
      console.log(`[collector] ${armed === null ? "disarmed" : `armed "${armed}"`}`);
      return send(res, 200, { armed });
    }

    if (route === "GET /state") return send(res, 200, { armed });
    if (route === "GET /triggers") return send(res, 200, store.listTriggers());

    if (parts[0] === "triggers" && req.method === "GET" && parts.length === 3 && parts[2] === "events") {
      const events = store.getTriggerEvents(decodeURIComponent(parts[1]));
      return events ? send(res, 200, events) : send(res, 404, { error: "unknown trigger" });
    }

    if (route === "POST /v1/traces") {
      const traces = (await readJson(req)) as Parameters<typeof printSpans>[0];
      printSpans(traces);
      const hops = spansToHops(traces);
      if (hops.length > 0) {
        store.addEvents(hops);
        for (const hop of hops) broadcast({ type: "event", event: hop });
        console.log(`[collector] stored ${hops.length} hops from spans`);
      }
      return send(res, 200, {});
    }

    send(res, 404, { error: "not found" });
  }

  await new Promise<void>((resolve) => server.listen(options.port, resolve));

  return {
    port: (server.address() as AddressInfo).port,
    close: async () => {
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      store.close();
    },
  };
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new BadRequest("body too large");
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || "null");
  } catch {
    throw new BadRequest("body is not valid JSON");
  }
}
