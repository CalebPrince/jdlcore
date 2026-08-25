import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual, randomBytes, scryptSync } from "node:crypto";
import { eq } from "drizzle-orm";
import { requireDb } from "@/db";
import { clients } from "@/db/schema";

const COOKIE_NAME = "jdl_portal";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // one week

function secret(): string {
  return `portal:${process.env.SESSION_SECRET ?? "jdlcore-dev-secret-change-me"}`;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
}

export async function createPortalSession(clientId: number): Promise<void> {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `${clientId}.${expires}`;
  const store = await cookies();
  store.set(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS / 1000,
    path: "/",
  });
}

export async function destroyPortalSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

async function sessionClientId(): Promise<number | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [id, expires, signature] = parts;
  const expected = sign(`${id}.${expires}`);
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(expires) < Date.now()) return null;
  const clientId = Number(id);
  return Number.isInteger(clientId) ? clientId : null;
}

export async function getPortalClient() {
  const clientId = await sessionClientId();
  if (!clientId) return null;
  try {
    const database = requireDb();
    const rows = await database
      .select()
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    const client = rows[0];
    if (!client || !client.active) return null;
    return client;
  } catch {
    return null;
  }
}

export function portalCookieName(): string {
  return COOKIE_NAME;
}
