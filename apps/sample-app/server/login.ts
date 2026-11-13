import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { boundary, currentTriggerId } from "capture";
import type { Request, Response } from "express";
import { WebSocket } from "ws";
import { pool } from "./db";
import { redis } from "./redis";
import { classifySegment } from "./llm";

const SESSION_TTL_SECONDS = 3600;

export interface User {
  id: number;
  email: string;
  plan: string;
  events_30d: number;
}

// clientId -> the browser's open WebSocket, filled in by index.ts.
export const sockets = new Map<string, WebSocket>();

export async function handleLogin(req: Request, res: Response): Promise<void> {
  const { email, password, clientId } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string" || typeof clientId !== "string") {
    res.status(400).json({ error: "email, password and clientId are required" });
    return;
  }

  const user = await validateCredentials(email, password);
  if (!user) {
    res.status(401).json({ error: "invalid credentials" });
    return;
  }

  const segment = await enrichProfile(user);
  const sessionKey = await createSession(user, segment);
  notifyClient(clientId, { sessionKey, user, segment });

  res.json({ ok: true });
}

export async function validateCredentials(email: string, password: string): Promise<User | null> {
  const { rows } = await pool.query(
    "SELECT id, email, plan, events_30d, password_hash FROM users WHERE email = $1",
    [email],
  );
  const row = rows[0];
  if (!row) return null;

  const [salt, hash] = row.password_hash.split(":");
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, expected.length);
  if (!timingSafeEqual(actual, expected)) return null;

  return { id: row.id, email: row.email, plan: row.plan, events_30d: row.events_30d };
}

export async function enrichProfile(user: User): Promise<string> {
  const { segment } = await classifySegment({ plan: user.plan, events_30d: user.events_30d });
  return segment;
}

export async function createSession(user: User, segment: string): Promise<string> {
  const key = `session:${randomUUID()}`;
  await redis.set(key, JSON.stringify({ userId: user.id, segment }), "EX", SESSION_TTL_SECONDS);
  return key;
}

export function notifyClient(
  clientId: string,
  result: { sessionKey: string; user: User; segment: string },
): void {
  const socket = sockets.get(clientId);
  if (!socket) return;
  const message = JSON.stringify({
    type: "login_ok",
    triggerId: currentTriggerId(), // set only while a trigger is armed; carries it to the client
    key: result.sessionKey,
    user: { id: result.user.id, plan: result.user.plan, segment: result.segment },
  });
  boundary("ws", "client", () => socket.send(message));
}
