import "server-only";
import { desc } from "drizzle-orm";
import { requireDb } from "@/db";
import { academyLearners, analyticsUsers, clients, inspectors, staff } from "@/db/schema";

/** Mirrors the accountType literals already used by passwordResetTokens. */
export type AccountType = "academy" | "analytics" | "portal" | "inspector" | "staff";

export type DirectoryAccount = {
  accountType: AccountType;
  id: number;
  name: string;
  email: string;
  statusLabel: string;
  lastLoginAt: Date | null;
};

/**
 * Every account that can be targeted by the superadmin "Reset Accounts" tool,
 * flattened from the five separate account tables into one shape.
 */
export async function listResettableAccounts(): Promise<DirectoryAccount[]> {
  const database = requireDb();

  const [clientRows, staffRows, inspectorRows, academyRows, analyticsRows] = await Promise.all([
    database
      .select({ id: clients.id, name: clients.name, email: clients.email, active: clients.active })
      .from(clients)
      .orderBy(desc(clients.createdAt)),
    database
      .select({ id: staff.id, name: staff.name, email: staff.email, status: staff.status })
      .from(staff)
      .orderBy(desc(staff.createdAt)),
    database
      .select({
        id: inspectors.id,
        name: inspectors.name,
        email: inspectors.email,
        status: inspectors.status,
        lastLoginAt: inspectors.lastLoginAt,
      })
      .from(inspectors)
      .orderBy(desc(inspectors.createdAt)),
    database
      .select({
        id: academyLearners.id,
        name: academyLearners.name,
        email: academyLearners.email,
        status: academyLearners.status,
        lastLoginAt: academyLearners.lastLoginAt,
      })
      .from(academyLearners)
      .orderBy(desc(academyLearners.createdAt)),
    database
      .select({
        id: analyticsUsers.id,
        name: analyticsUsers.name,
        email: analyticsUsers.email,
        status: analyticsUsers.status,
        lastLoginAt: analyticsUsers.lastLoginAt,
      })
      .from(analyticsUsers)
      .orderBy(desc(analyticsUsers.createdAt)),
  ]);

  return [
    ...clientRows.map((c) => ({
      accountType: "portal" as const,
      id: c.id,
      name: c.name,
      email: c.email,
      statusLabel: c.active ? "Active" : "Disabled",
      lastLoginAt: null,
    })),
    ...staffRows.map((s) => ({
      accountType: "staff" as const,
      id: s.id,
      name: s.name,
      email: s.email,
      statusLabel: s.status,
      lastLoginAt: null,
    })),
    ...inspectorRows.map((i) => ({
      accountType: "inspector" as const,
      id: i.id,
      name: i.name,
      email: i.email,
      statusLabel: i.status,
      lastLoginAt: i.lastLoginAt,
    })),
    ...academyRows.map((a) => ({
      accountType: "academy" as const,
      id: a.id,
      name: a.name,
      email: a.email,
      statusLabel: a.status,
      lastLoginAt: a.lastLoginAt,
    })),
    ...analyticsRows.map((a) => ({
      accountType: "analytics" as const,
      id: a.id,
      name: a.name,
      email: a.email,
      statusLabel: a.status,
      lastLoginAt: a.lastLoginAt,
    })),
  ];
}
