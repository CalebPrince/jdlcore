import "server-only";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { eq, and, gt } from "drizzle-orm";
import { requireDb } from "@/db";
import { analyticsUsers } from "@/db/schema";

export const ANALYTICS_SESSION_COOKIE = "jdl_analytics";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // two weeks
const SETUP_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // seven days

function secret(): string {
  return `analytics:${process.env.SESSION_SECRET ?? "jdlcore-dev-secret-change-me"}`;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

function sessionCookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS / 1000,
    path: "/",
  };
}

function sessionCookieValue(userId: number): string {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `${userId}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * Sets the session cookie via the ambient cookies() jar — works in Server Actions
 * and Server Components, but NOT reliably in a Route Handler that also returns its
 * own NextResponse (e.g. a redirect): Next.js does not merge cookies() mutations
 * into an explicitly-constructed response in that case. Route Handlers building a
 * redirect must use applyAnalyticsSessionCookie(response, userId) instead.
 */
export async function createAnalyticsSession(userId: number): Promise<void> {
  const store = await cookies();
  store.set(ANALYTICS_SESSION_COOKIE, sessionCookieValue(userId), sessionCookieOptions());
}

/** Sets the session cookie directly on a Route Handler's own NextResponse (see note above). */
export function applyAnalyticsSessionCookie(response: NextResponse, userId: number): void {
  response.cookies.set(ANALYTICS_SESSION_COOKIE, sessionCookieValue(userId), sessionCookieOptions());
}

export async function destroyAnalyticsSession(): Promise<void> {
  const store = await cookies();
  store.delete(ANALYTICS_SESSION_COOKIE);
}

async function sessionUserId(): Promise<number | null> {
  const store = await cookies();
  const token = store.get(ANALYTICS_SESSION_COOKIE)?.value;
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [id, expires, signature] = parts;
  const expected = sign(`${id}.${expires}`);
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(expires) < Date.now()) return null;
  const userId = Number(id);
  return Number.isInteger(userId) ? userId : null;
}

export async function getAnalyticsUser() {
  const userId = await sessionUserId();
  if (!userId) return null;
  try {
    const database = requireDb();
    const rows = await database
      .select()
      .from(analyticsUsers)
      .where(eq(analyticsUsers.id, userId))
      .limit(1);
    const user = rows[0];
    if (!user || user.status !== "active") return null;
    return user;
  } catch {
    return null;
  }
}

/** Issues a fresh setup token for a user. Returns the raw token (shown once). */
export async function issueSetupToken(userId: number): Promise<string> {
  const token = randomBytes(24).toString("hex");
  const database = requireDb();
  await database
    .update(analyticsUsers)
    .set({
      setupToken: token,
      setupTokenExpires: new Date(Date.now() + SETUP_TOKEN_TTL_MS),
      status: "invited",
      passwordHash: null,
    })
    .where(eq(analyticsUsers.id, userId));
  return token;
}

export async function verifySetupToken(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  try {
    const database = requireDb();
    const rows = await database
      .select()
      .from(analyticsUsers)
      .where(
        and(
          eq(analyticsUsers.setupToken, token),
          gt(analyticsUsers.setupTokenExpires, new Date()),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}
