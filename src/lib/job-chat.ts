import "server-only";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import { requireDb } from "@/db";
import { clients, inspectors, jobComments, jobs } from "@/db/schema";
import { getPortalClient } from "@/lib/portal-auth";
import { getInspector } from "@/lib/inspector-auth";
import { getStaff } from "@/lib/staff-auth";
import { notifyBoth, notifyStaffBoth } from "@/lib/notifications";
import { brandedEmailHtml } from "@/lib/email";
import type { StoredUpload } from "@/lib/uploads";

/**
 * The job chat: one group thread per job, shared by the client, Operations and the assigned
 * inspector. Messages live in job_comments and can carry one attachment (a document, picture or
 * voice note). Every read and write goes through resolveChatParticipant, so a client only ever
 * reaches their own jobs and an inspector only the jobs assigned to them.
 */

export type ChatRole = "client" | "staff" | "inspector";

export type ChatAttachment = { name: string; mimeType: string; sizeBytes: number; kind: "audio" | "image" | "file" };

export type ChatMessage = {
  id: number;
  authorType: string;
  authorId: number | null;
  authorName: string;
  body: string;
  createdAt: string;
  attachment: ChatAttachment | null;
};

export type ChatParticipant = {
  role: ChatRole;
  id: number;
  name: string;
  job: typeof jobs.$inferSelect;
};

export const CHAT_MESSAGE_MAX = 2000;

/** A sender's messages within this window count as one burst: only the first one notifies the others. */
const NOTIFY_QUIET_MS = 10 * 60 * 1000;

const OPS_ROLES = ["operations", "administrator", "superadmin"] as const;

/**
 * Confirms the signed-in session for `role` may use this job's chat. The role is named by the
 * caller (a browser can hold a client and a staff session at once), but access always comes from
 * that role's own session cookie and the job's ownership, never from the request.
 */
export async function resolveChatParticipant(jobId: number, role: ChatRole): Promise<ChatParticipant | null> {
  if (!Number.isInteger(jobId) || jobId <= 0) return null;
  const rows = await requireDb().select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  const job = rows[0];
  if (!job) return null;

  if (role === "client") {
    const client = await getPortalClient();
    if (!client || job.clientId !== client.id) return null;
    return { role, id: client.id, name: client.name, job };
  }
  if (role === "inspector") {
    const inspector = await getInspector();
    if (!inspector || job.assignedInspectorId !== inspector.id) return null;
    return { role, id: inspector.id, name: inspector.name, job };
  }
  const staff = await getStaff();
  if (!staff || !(OPS_ROLES as readonly string[]).includes(staff.role)) return null;
  return { role: "staff", id: staff.id, name: staff.name, job };
}

/** Everything about a message except the attachment's bytes, which are only ever read by the attachment route. */
const MESSAGE_COLUMNS = {
  id: jobComments.id,
  authorType: jobComments.authorType,
  authorId: jobComments.authorId,
  authorName: jobComments.authorName,
  body: jobComments.body,
  createdAt: jobComments.createdAt,
  attachmentName: jobComments.attachmentName,
  attachmentMime: jobComments.attachmentMime,
  attachmentSize: jobComments.attachmentSize,
};

type MessageRow = {
  id: number;
  authorType: string;
  authorId: number | null;
  authorName: string;
  body: string;
  createdAt: Date;
  attachmentName: string | null;
  attachmentMime: string | null;
  attachmentSize: number | null;
};

function attachmentKind(mimeType: string): ChatAttachment["kind"] {
  if (mimeType.startsWith("audio/") || mimeType === "video/webm") return "audio";
  if (mimeType.startsWith("image/")) return "image";
  return "file";
}

function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    authorType: row.authorType,
    authorId: row.authorId,
    authorName: row.authorName,
    body: row.body,
    createdAt: new Date(row.createdAt).toISOString(),
    attachment: row.attachmentName
      ? {
          name: row.attachmentName,
          mimeType: row.attachmentMime ?? "application/octet-stream",
          sizeBytes: row.attachmentSize ?? 0,
          kind: attachmentKind(row.attachmentMime ?? ""),
        }
      : null,
  };
}

/** Messages on a job, oldest first. With `afterId`, only the ones newer than that message. */
export async function listJobMessages(jobId: number, afterId = 0): Promise<ChatMessage[]> {
  const rows = await requireDb()
    .select(MESSAGE_COLUMNS)
    .from(jobComments)
    .where(afterId > 0 ? and(eq(jobComments.jobId, jobId), gt(jobComments.id, afterId)) : eq(jobComments.jobId, jobId))
    .orderBy(asc(jobComments.id));
  return rows.map(toMessage);
}

/** One message's attachment, bytes included. Only for a participant already checked against this job. */
export async function getJobMessageAttachment(jobId: number, messageId: number) {
  const rows = await requireDb()
    .select({ data: jobComments.attachmentData, name: jobComments.attachmentName, mimeType: jobComments.attachmentMime })
    .from(jobComments)
    .where(and(eq(jobComments.id, messageId), eq(jobComments.jobId, jobId)))
    .limit(1);
  const row = rows[0];
  if (!row?.data) return null;
  return { data: row.data, name: row.name, mimeType: row.mimeType };
}

const ROLE_LABEL: Record<ChatRole, string> = { client: "the client", staff: "Operations", inspector: "the inspector" };

async function notifyOthers(sender: ChatParticipant, body: string): Promise<void> {
  const { job } = sender;
  const title = `New message on ${job.ref} from ${sender.name}`;
  const preview = body.slice(0, 140);
  const emailBody = body.slice(0, 500);
  const database = requireDb();

  if (sender.role !== "client") {
    const rows = await database.select({ email: clients.email }).from(clients).where(eq(clients.id, job.clientId)).limit(1);
    if (rows[0]) {
      await notifyBoth({
        recipientType: "client",
        recipientId: job.clientId,
        email: rows[0].email,
        jobId: job.id,
        type: "job_comment",
        title,
        body: preview,
        link: `/portal/jobs/${job.id}#chat`,
        emailSubject: `[${job.ref}] New message on your job - JDL Core`,
        emailHtml: brandedEmailHtml({
          label: "JDL CORE CLIENT PORTAL",
          heading: `New message from ${ROLE_LABEL[sender.role]}`,
          bodyLines: [emailBody],
          ctaUrl: `https://jdlcore.com/portal/jobs/${job.id}#chat`,
          ctaLabel: "Open the chat",
          footer: `Job reference: ${job.ref}`,
        }),
      });
    }
  }

  if (sender.role !== "inspector" && job.assignedInspectorId) {
    const rows = await database
      .select({ email: inspectors.email })
      .from(inspectors)
      .where(eq(inspectors.id, job.assignedInspectorId))
      .limit(1);
    if (rows[0]) {
      await notifyBoth({
        recipientType: "inspector",
        recipientId: job.assignedInspectorId,
        email: rows[0].email,
        jobId: job.id,
        type: "job_comment",
        title,
        body: preview,
        link: `/inspector/jobs/${job.id}#chat`,
        emailSubject: `[${job.ref}] New message on your job - JDL Core`,
        emailHtml: brandedEmailHtml({
          label: "JDL CORE INSPECTOR PORTAL",
          heading: `New message from ${ROLE_LABEL[sender.role]}`,
          bodyLines: [emailBody],
          ctaUrl: `https://jdlcore.com/inspector/jobs/${job.id}#chat`,
          ctaLabel: "Open the chat",
          footer: `Job reference: ${job.ref}`,
        }),
      });
    }
  }

  if (sender.role !== "staff") {
    await notifyStaffBoth({
      roles: [...OPS_ROLES],
      type: sender.role === "client" ? "client_comment" : "job_comment",
      title,
      body: preview,
      link: `/admin/jobs/${job.id}#chat`,
      emailSubject: `[${job.ref}] ${title}`,
      emailHtml: brandedEmailHtml({
        label: "JDL CORE ADMIN",
        heading: title,
        bodyLines: [emailBody],
        ctaUrl: `https://jdlcore.com/admin/jobs/${job.id}#chat`,
        ctaLabel: "Open the chat",
      }),
    });
  }
}

/**
 * Saves a chat message and lets the other two parties know. To keep a live back-and-forth from
 * flooding inboxes, the bell and email only fire for the first message of a burst: nothing is sent
 * when the same sender already wrote on this job within the last ten minutes.
 */
export async function postJobMessage(sender: ChatParticipant, rawBody: string, upload?: StoredUpload | null): Promise<ChatMessage> {
  const body = rawBody.trim().slice(0, CHAT_MESSAGE_MAX);
  const database = requireDb();

  const previous = await database
    .select({ createdAt: jobComments.createdAt })
    .from(jobComments)
    .where(
      and(
        eq(jobComments.jobId, sender.job.id),
        eq(jobComments.authorType, sender.role),
        eq(jobComments.authorId, sender.id),
      ),
    )
    .orderBy(desc(jobComments.id))
    .limit(1);

  const inserted = await database
    .insert(jobComments)
    .values({
      jobId: sender.job.id,
      authorType: sender.role,
      authorId: sender.id,
      authorName: sender.name,
      body,
      attachmentData: upload?.dataUrl ?? null,
      attachmentName: upload?.fileName ?? null,
      attachmentMime: upload?.mimeType ?? null,
      attachmentSize: upload?.sizeBytes ?? null,
    })
    .returning(MESSAGE_COLUMNS);

  const quiet = previous[0] && Date.now() - new Date(previous[0].createdAt).getTime() < NOTIFY_QUIET_MS;
  if (!quiet) {
    try {
      const attachmentLine = upload
        ? attachmentKind(upload.mimeType) === "audio"
          ? "Sent a voice message."
          : `Sent a file: ${upload.fileName}`
        : "";
      await notifyOthers(sender, [body, attachmentLine].filter(Boolean).join(" "));
    } catch (err) {
      console.error("job chat notify:", err);
    }
  }

  return toMessage(inserted[0]);
}
