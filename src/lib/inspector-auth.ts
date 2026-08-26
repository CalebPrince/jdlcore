import "server-only";
import { cookies } from "next/headers";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { requireDb } from "@/db";
import { inspectors } from "@/db/schema";

const COOKIE_NAME = "jdl_inspector";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // one week
const SETUP_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function secret(): string {
  return `inspector:${process.env.SESSION_SECRET ?? "jdlcore-dev-secret-change-me"}`;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export async function createInspectorSession(inspectorId: number): Promise<void> {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `${inspectorId}.${expires}`;
  const store = await cookies();
  store.set(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS / 1000,
    path: "/",
  });
}

export async function destroyInspectorSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

async function sessionInspectorId(): Promise<number | null> {
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
  const inspectorId = Number(id);
  return Number.isInteger(inspectorId) ? inspectorId : null;
}

export async function getInspector() {
  const inspectorId = await sessionInspectorId();
  if (!inspectorId) return null;
  try {
    const database = requireDb();
    const rows = await database
      .select()
      .from(inspectors)
      .where(eq(inspectors.id, inspectorId))
      .limit(1);
    const row = rows[0];
    if (!row || !row.active || row.status !== "active") return null;
    return row;
  } catch {
    return null;
  }
}

export function inspectorCookieName(): string {
  return COOKIE_NAME;
}

export async function issueInspectorSetupToken(inspectorId: number): Promise<string> {
  const token = randomBytes(24).toString("hex");
  await requireDb()
    .update(inspectors)
    .set({
      setupToken: token,
      setupTokenExpires: new Date(Date.now() + SETUP_TOKEN_TTL_MS),
      status: "invited",
      passwordHash: null,
    })
    .where(eq(inspectors.id, inspectorId));
  return token;
}

export async function verifyInspectorSetupToken(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  try {
    const rows = await requireDb()
      .select()
      .from(inspectors)
      .where(and(eq(inspectors.setupToken, token), gt(inspectors.setupTokenExpires, new Date())))
      .limit(1);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}
