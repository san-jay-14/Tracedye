import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";

export type SimulateResult = { ok: true; triggerId?: string } | { ok: false; status: number; error: string };

export interface Simulator {
  simulate(): Promise<SimulateResult>;
}

export interface SimulatorOptions {
  sampleUrl: string; // the sample app, which is not reachable from outside
  email: string;
  password: string;
  minGapMs?: number; // between two logins, for everyone together
  maxPerMinute?: number; // for everyone together
  timeoutMs?: number;
  now?: () => number;
}

// Does a real login against the sample app, the way its own page would: a WebSocket is open first,
// so the app can push the result back (the fifth hop), then the login request is sent. The
// credentials stay on the server. Visitors only get to press a button, and the button is rate-limited.
export function createSimulator(options: SimulatorOptions): Simulator {
  const minGapMs = options.minGapMs ?? 2500;
  const maxPerMinute = options.maxPerMinute ?? 20;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const now = options.now ?? Date.now;

  let running = false;
  let lastStart = -Infinity;
  let starts: number[] = [];

  async function login(): Promise<{ triggerId?: string }> {
    const clientId = randomUUID();
    const socket = new WebSocket(`${options.sampleUrl.replace(/^http/, "ws")}/ws?clientId=${clientId}`);
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once("open", resolve);
        socket.once("error", reject);
      });
      const pushed = new Promise<{ triggerId?: string }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("no push from the app")), timeoutMs);
        socket.on("message", (data) => {
          const message = JSON.parse(data.toString());
          if (message.type !== "login_ok") return;
          clearTimeout(timer);
          resolve({ triggerId: message.triggerId });
        });
      });
      const response = await fetch(`${options.sampleUrl}/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: options.email, password: options.password, clientId }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`login answered ${response.status}`);
      return await pushed;
    } finally {
      socket.close();
    }
  }

  return {
    async simulate() {
      const at = now();
      starts = starts.filter((t) => at - t < 60_000);
      if (running) return { ok: false, status: 429, error: "A login is already running. Try again in a moment." };
      if (at - lastStart < minGapMs) return { ok: false, status: 429, error: "Please wait a moment between clicks." };
      if (starts.length >= maxPerMinute) return { ok: false, status: 429, error: "That is a lot of logins. Try again in a minute." };

      running = true;
      lastStart = at;
      starts.push(at);
      try {
        return { ok: true, ...(await login()) };
      } catch {
        return { ok: false, status: 502, error: "The sample app did not answer. It may still be starting; try again shortly." };
      } finally {
        running = false;
      }
    },
  };
}
