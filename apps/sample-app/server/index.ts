import { createServer } from "node:http";
import express from "express";
import { WebSocketServer } from "ws";
import { handleLogin, sockets } from "./login";

const app = express();
app.use(express.json());
app.post("/login", (req, res, next) => {
  handleLogin(req, res).catch(next);
});

const server = createServer(app);

// The browser opens /ws?clientId=... before logging in, so notifyClient can find it.
const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (socket, req) => {
  const clientId = new URL(req.url ?? "", "http://localhost").searchParams.get("clientId");
  if (!clientId) {
    socket.close();
    return;
  }
  sockets.set(clientId, socket);
  socket.on("close", () => sockets.delete(clientId));
});

const port = Number(process.env.PORT ?? 3001);
server.listen(port, () => console.log(`sample-app server on http://localhost:${port}`));
