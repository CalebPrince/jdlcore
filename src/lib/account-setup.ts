import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { requireDb } from "@/db";
import { passwordResetTokens } from "@/db/schema";

const SETUP_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * One-time "choose your password" link for a client portal account, using the same hashed
 * token table and /account/reset-password page as self-service recovery. Lets a newly created
 * account be handed over without emailing a plaintext password. Earlier unused tokens for the
 * account are invalidated so only the newest link works.
 */
export async function issuePortalSetupLink(clientId: number): Promise<string> {
  const database = requireDb();
  const rawToken = randomBytes(32).toString("hex");
  await database
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(passwordResetTokens.accountType, "portal"),
        eq(passwordResetTokens.accountId, clientId),
        isNull(passwordResetTokens.usedAt),
      ),
    );
  await database.insert(passwordResetTokens).values({
    accountType: "portal",
    accountId: clientId,
    tokenHash: createHash("sha256").update(rawToken).digest("hex"),
    expiresAt: new Date(Date.now() + SETUP_LINK_TTL_MS),
  });
  return `https://jdlcore.com/account/reset-password?token=${rawToken}`;
}
