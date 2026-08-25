import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { eq, and, gt } from "drizzle-orm";
import { requireDb } from "@/db";
import { analyticsUsers } from "@/db/schema";

const COOKIE_NAME = "jdl_analytics";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // two weeks
const SETUP_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // seven days

function secret(): string {
  return `analytics:${process.env.SESSION_SECRET ?? "jdlcore-dev-secret-change-me"}`;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export async function createAnalyticsSession(userId: number): Promise<void> {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `${userId}.${expires}`;
  const store = await cookies();
  store.set(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS / 1000,
    path: "/",
  });
}

export async function destroyAnalyticsSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

async function sessionUserId(): Promise<number | null> {
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
