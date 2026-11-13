import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

// A tiny app for the dfd tests: a request goes through three named functions.
export function parseName(url: string | undefined) {
  const name = new URL(url ?? "/", "http://localhost").searchParams.get("name") ?? "world";
  return name.trim();
}

export function greet(name: string) {
  const message = `hello ${name}`;
  return message;
}

function respond(req: IncomingMessage, res: ServerResponse) {
  const name = parseName(req.url);
  res.end(greet(name));
}

const port = Number(process.env.PORT ?? 3100);
createServer((req, res) => respond(req, res)).listen(port, () => console.log(`fixture app on ${port}`));
