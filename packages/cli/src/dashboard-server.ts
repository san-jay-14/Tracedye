import { createReadStream, statSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { WebSocket, WebSocketServer } from "ws";

// Serves the built dashboard and forwards /collector/* to the collector, so the browser sees a
// single address and the collector needs no CORS handling (the same job vite.config.ts does in development).

const PREFIX = "/collector";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

export interface DashboardServer {
  port: number;
  close(): Promise<void>;
}

export interface DashboardOptions {
  dir: string;
  port: number;
  collectorUrl: string;
  // For a public deployment: only collector requests this allows get through, so strangers can read
  // but never arm, send events or replace the map. It sees the method and the path without the query.
  allowCollector?: (method: string, target: string) => boolean;
  // The host's own routes, tried first. Return true once the request has been answered.
  handle?: (req: http.IncomingMessage, res: http.ServerResponse) => boolean | Promise<boolean>;
}

export async function startDashboard(options: DashboardOptions): Promise<DashboardServer> {
  const root = path.resolve(options.dir);
  const collector = new URL(options.collectorUrl);

  const server = http.createServer(async (req, res) => {
    try {
      if (options.handle && (await options.handle(req, res))) return;
      const url = req.url ?? "/";
      if (url === PREFIX || url.startsWith(`${PREFIX}/`)) {
        const target = url.slice(PREFIX.length) || "/";
        const allowed = !options.allowCollector || options.allowCollector(req.method ?? "GET", target.split("?")[0]);
        if (!allowed) return void res.writeHead(403, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "not available here" }));
        return proxy(req, res, collector, target);
      }
      serveFile(root, url, res);
    } catch {
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "internal error" }));
    }
  });

  // The page's WebSocket (/collector/stream) is passed through to the collector's /stream.
  const bridge = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    if (req.url !== `${PREFIX}/stream`) return socket.destroy();
    bridge.handleUpgrade(req, socket, head, (client) => {
      const upstream = new WebSocket(`ws://${collector.host}/stream`);
      upstream.on("message", (data) => client.send(data.toString()));
      upstream.on("close", () => client.close());
      upstream.on("error", () => client.close());
      client.on("close", () => upstream.close());
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, resolve);
  });

  return {
    port: (server.address() as AddressInfo).port,
    close: async () => {
      for (const client of bridge.clients) client.terminate();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function proxy(req: http.IncomingMessage, res: http.ServerResponse, collector: URL, target: string): void {
  const upstream = http.request(
    { host: collector.hostname, port: collector.port, method: req.method, path: target, headers: { ...req.headers, host: collector.host } },
    (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "the collector is not reachable" }));
  });
  req.pipe(upstream);
}

function serveFile(root: string, url: string, res: http.ServerResponse): void {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }

  const file = path.join(root, path.normalize(pathname));
  // Never read outside the dashboard folder, whatever the path says.
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }

  if (isFile(file)) return send(file, res);
  // A path with no extension is a page of the app itself, so it gets index.html; a missing asset is a 404.
  if (path.extname(pathname) === "") return send(path.join(root, "index.html"), res);
  res.writeHead(404).end();
}

const isFile = (file: string) => {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
};

function send(file: string, res: http.ServerResponse): void {
  if (!isFile(file)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-cache" });
  createReadStream(file).pipe(res);
}
