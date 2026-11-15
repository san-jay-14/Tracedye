import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { createSimulator } from "./simulate";

// A stand-in for the sample app: a WebSocket at /ws?clientId=..., and POST /login that pushes login_ok.
interface Fake {
  url: string;
  log: string[];
  logins: { email: string; password: string; clientId: string }[];
  close(): Promise<void>;
}

async function fakeSampleApp(behaviour: { status?: number; push?: boolean; delayMs?: number } = {}): Promise<Fake> {
  const log: string[] = [];
  const logins: Fake["logins"] = [];
  const sockets = new Map<string, WebSocket>();
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      const login = JSON.parse(body);
      log.push("login");
      logins.push(login);
      if (behaviour.delayMs) await new Promise((resolve) => setTimeout(resolve, behaviour.delayMs));
      if (behaviour.push !== false && (behaviour.status ?? 200) === 200) {
        sockets.get(login.clientId)?.send(JSON.stringify({ type: "login_ok", triggerId: "user-login-1" }));
      }
      res.writeHead(behaviour.status ?? 200, { "Content-Type": "application/json" }).end("{}");
    });
  });
  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (socket, req) => {
    log.push("socket");
    sockets.set(new URL(req.url ?? "", "http://x").searchParams.get("clientId") ?? "", socket);
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  return {
    url: `http://localhost:${(server.address() as AddressInfo).port}`,
    log,
    logins,
    close: async () => {
      for (const client of wss.clients) client.terminate();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

let fake: Fake | undefined;
afterEach(async () => {
  await fake?.close();
  fake = undefined;
});

const creds = { email: "demo@example.com", password: "demo-password" };

describe("createSimulator", () => {
  it("opens the socket first, then logs in, and returns the trigger the app pushed", async () => {
    fake = await fakeSampleApp();
    const result = await createSimulator({ sampleUrl: fake.url, ...creds }).simulate();
    expect(result).toEqual({ ok: true, triggerId: "user-login-1" });
    expect(fake.log).toEqual(["socket", "login"]); // the push needs a socket that is already there
    expect(fake.logins[0]).toMatchObject(creds);
    expect(fake.logins[0].clientId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reports a failed login, without leaking details", async () => {
    fake = await fakeSampleApp({ status: 401 });
    const result = await createSimulator({ sampleUrl: fake.url, ...creds }).simulate();
    expect(result).toEqual({ ok: false, status: 502, error: expect.stringMatching(/did not answer/) });
    expect(JSON.stringify(result)).not.toContain("demo-password");
  });

  it("gives up when the app never pushes the result", async () => {
    fake = await fakeSampleApp({ push: false });
    const result = await createSimulator({ sampleUrl: fake.url, ...creds, timeoutMs: 300 }).simulate();
    expect(result.ok).toBe(false);
  });

  it("answers 502, quickly, when the app is not there at all", async () => {
    const result = await createSimulator({ sampleUrl: "http://127.0.0.1:9", ...creds, timeoutMs: 500 }).simulate();
    expect(result).toMatchObject({ ok: false, status: 502 });
  });

  it("makes everyone wait a moment between logins", async () => {
    fake = await fakeSampleApp();
    let clock = 1_000_000;
    const simulator = createSimulator({ sampleUrl: fake.url, ...creds, minGapMs: 2500, now: () => clock });
    expect((await simulator.simulate()).ok).toBe(true);
    clock += 1000;
    expect(await simulator.simulate()).toMatchObject({ ok: false, status: 429 });
    clock += 2000;
    expect((await simulator.simulate()).ok).toBe(true);
  });

  it("caps logins per minute, then allows more once the minute has passed", async () => {
    fake = await fakeSampleApp();
    let clock = 1_000_000;
    const simulator = createSimulator({ sampleUrl: fake.url, ...creds, minGapMs: 0, maxPerMinute: 2, now: () => clock });
    expect((await simulator.simulate()).ok).toBe(true);
    clock += 10;
    expect((await simulator.simulate()).ok).toBe(true);
    clock += 10;
    expect(await simulator.simulate()).toMatchObject({ ok: false, status: 429, error: expect.stringMatching(/minute/) });
    clock += 61_000;
    expect((await simulator.simulate()).ok).toBe(true);
  });

  it("runs one login at a time: a second click while one is running is refused", async () => {
    fake = await fakeSampleApp({ delayMs: 300 });
    const simulator = createSimulator({ sampleUrl: fake.url, ...creds, minGapMs: 0 });
    const first = simulator.simulate();
    const second = await simulator.simulate();
    expect(second).toMatchObject({ ok: false, status: 429, error: expect.stringMatching(/already running/) });
    expect((await first).ok).toBe(true);
    expect(fake.logins).toHaveLength(1);
  });

  it("does not count a refused click against the limits", async () => {
    fake = await fakeSampleApp();
    let clock = 1_000_000;
    const simulator = createSimulator({ sampleUrl: fake.url, ...creds, minGapMs: 2500, maxPerMinute: 2, now: () => clock });
    await simulator.simulate();
    for (let i = 0; i < 5; i++) {
      clock += 100;
      await simulator.simulate(); // all refused: too soon
    }
    clock += 3000;
    expect((await simulator.simulate()).ok).toBe(true); // the second of two allowed
  });
});
