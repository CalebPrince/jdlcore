import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { requireDb } from "@/db";
import { staff } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/portal-auth";

export { hashPassword, verifyPassword };

export type StaffRole = "superadmin" | "administrator" | "operations";

const COOKIE_NAME = "jdl_staff";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // one week

function secret(): string {
  return `staff:${process.env.SESSION_SECRET ?? "jdlcore-dev-secret-change-me"}`;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export async function createStaffSession(staffId: number): Promise<void> {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `${staffId}.${expires}`;
  const store = await cookies();
  store.set(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS / 1000,
    path: "/",
  });
}

export async function destroyStaffSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

async function sessionStaffId(): Promise<number | null> {
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
  const staffId = Number(id);
  return Number.isInteger(staffId) ? staffId : null;
}

export async function getStaff() {
  const staffId = await sessionStaffId();
  if (!staffId) return null;
  try {
    const database = requireDb();
    const rows = await database.select().from(staff).where(eq(staff.id, staffId)).limit(1);
    const row = rows[0];
    if (!row || row.status !== "active") return null;
    return row;
  } catch {
    return null;
  }
}

/**
 * First line of a staff-facing server action: returns the staff row if the
 * caller is logged in AND has one of the allowed roles, otherwise null.
 */
export async function requireStaffRole(roles: StaffRole[]) {
  const current = await getStaff();
  if (!current) return null;
  if (!roles.includes(current.role as StaffRole)) return null;
  return current;
}

export function staffCookieName(): string {
  return COOKIE_NAME;
}
