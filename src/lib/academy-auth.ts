import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { requireDb } from "@/db";
import { academyLearners } from "@/db/schema";

const COOKIE_NAME = "jdl_academy";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

function sign(payload: string) {
  const secret = `academy:${process.env.SESSION_SECRET ?? "jdlcore-dev-secret-change-me"}`;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export async function createAcademySession(learnerId: number) {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `${learnerId}.${expires}`;
  const store = await cookies();
  store.set(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS / 1000,
    path: "/",
  });
}

export async function destroyAcademySession() {
  (await cookies()).delete(COOKIE_NAME);
}

async function sessionLearnerId() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const [id, expires, signature] = token.split(".");
  if (!id || !expires || !signature || Number(expires) < Date.now()) return null;
  const expected = sign(`${id}.${expires}`);
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const learnerId = Number(id);
  return Number.isInteger(learnerId) ? learnerId : null;
}

export async function getAcademyLearner() {
  const id = await sessionLearnerId();
  if (!id) return null;
  try {
    const rows = await requireDb().select().from(academyLearners).where(eq(academyLearners.id, id)).limit(1);
    const learner = rows[0];
    return learner?.status === "active" ? learner : null;
  } catch {
    return null;
  }
}
