import "server-only";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { requireDb } from "@/db";
import { clients, inspectors, jobChatReads, jobComments, jobs } from "@/db/schema";
import { getPortalClient } from "@/lib/portal-auth";
import { getInspector } from "@/lib/inspector-auth";
import { getStaff } from "@/lib/staff-auth";
import { notifyBoth, notifyStaffBoth } from "@/lib/notifications";
import { brandedEmailHtml } from "@/lib/email";
import type { StoredUpload } from "@/lib/uploads";
import { chatTopic, inboxTopic, realtimeConfig, ring } from "@/lib/realtime";

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

/* ---------------- Unread tracking ---------------- */

/** Records that this person has read the job's chat up to `lastMessageId`. Only ever moves forward. */
export async function markChatRead(reader: ChatParticipant, lastMessageId: number): Promise<void> {
  if (!Number.isInteger(lastMessageId) || lastMessageId <= 0) return;
  await requireDb()
    .insert(jobChatReads)
    .values({ jobId: reader.job.id, readerType: reader.role, readerId: reader.id, lastReadMessageId: lastMessageId })
    .onConflictDoUpdate({
      target: [jobChatReads.jobId, jobChatReads.readerType, jobChatReads.readerId],
      set: {
        lastReadMessageId: sql`greatest(${jobChatReads.lastReadMessageId}, ${lastMessageId})`,
        updatedAt: new Date(),
      },
    });
}

/**
 * Unread chat messages per job for one person: messages newer than the last one they read, not
 * counting their own. The caller passes only jobs this person is allowed to see. Jobs with nothing
 * unread are simply absent from the map. Returns an empty map if the lookup fails, so a job list
 * never breaks over a badge.
 */
export async function unreadChatCounts(role: ChatRole, readerId: number, jobIds: number[]): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  if (jobIds.length === 0) return counts;
  try {
    const rows = await requireDb()
      .select({ jobId: jobComments.jobId, n: sql<number>`count(*)::int` })
      .from(jobComments)
      .leftJoin(
        jobChatReads,
        and(eq(jobChatReads.jobId, jobComments.jobId), eq(jobChatReads.readerType, role), eq(jobChatReads.readerId, readerId)),
      )
      .where(
        and(
          inArray(jobComments.jobId, jobIds),
          sql`${jobComments.id} > coalesce(${jobChatReads.lastReadMessageId}, 0)`,
          sql`not (${jobComments.authorType} = ${role} and ${jobComments.authorId} is not distinct from ${readerId})`,
        ),
      )
      .groupBy(jobComments.jobId);
    for (const row of rows) counts.set(row.jobId, row.n);
  } catch (err) {
    console.error("unreadChatCounts:", err);
  }
  return counts;
}

/** What an open chat needs to listen live: the public connection details and this job's channel. Null when Realtime isn't set up. */
export function chatRealtimeProps(jobId: number): { url: string; anonKey: string; topic: string } | null {
  const config = realtimeConfig();
  return config ? { ...config, topic: chatTopic(jobId) } : null;
}

/** The same, for a person's job lists (their unread badges). */
export function inboxRealtimeProps(role: ChatRole, id: number): { url: string; anonKey: string; topic: string } | null {
  const config = realtimeConfig();
  return config ? { ...config, topic: inboxTopic(role, id) } : null;
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

  // Sending a message means you have seen everything up to it.
  try {
    await markChatRead(sender, inserted[0].id);
  } catch (err) {
    console.error("job chat mark read:", err);
  }

  // Ring the open chats and everyone's job lists straight away; the bell and email come after.
  await ring([
    chatTopic(sender.job.id),
    inboxTopic("client", sender.job.clientId),
    inboxTopic("staff", 0),
    ...(sender.job.assignedInspectorId ? [inboxTopic("inspector", sender.job.assignedInspectorId)] : []),
  ]);

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

/* ---------------- Conversations (the floating chat's list) ---------------- */

export type ChatConversation = {
  jobId: number;
  ref: string;
  title: string;
  status: string;
  /** Who the job is for; shown to Operations and inspectors, who see many clients. */
  clientName: string | null;
  unread: number;
  lastMessage: { authorName: string; preview: string; at: string } | null;
};

const CONVERSATION_LIMIT = 80;

/**
 * The job chats one person can open, most recently active first: a client's own jobs, an
 * inspector's assigned jobs, or (for Operations) every job that isn't closed. Each carries its
 * unread count and a preview of the latest message. The caller has already established who the
 * person is from their session.
 */
export async function listConversations(role: ChatRole, viewerId: number): Promise<ChatConversation[]> {
  const database = requireDb();
  const scope =
    role === "client"
      ? eq(jobs.clientId, viewerId)
      : role === "inspector"
        ? eq(jobs.assignedInspectorId, viewerId)
        : sql`${jobs.status} <> 'closed'`;

  const jobRows = await database
    .select({
      id: jobs.id,
      ref: jobs.ref,
      service: jobs.service,
      location: jobs.location,
      status: jobs.status,
      updatedAt: jobs.updatedAt,
      clientName: clients.name,
    })
    .from(jobs)
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .where(scope)
    .orderBy(desc(jobs.updatedAt))
    .limit(CONVERSATION_LIMIT);
  if (jobRows.length === 0) return [];

  const jobIds = jobRows.map((j) => j.id);
  const [lastRows, unread] = await Promise.all([
    database
      .selectDistinctOn([jobComments.jobId], {
        jobId: jobComments.jobId,
        authorName: jobComments.authorName,
        body: jobComments.body,
        attachmentName: jobComments.attachmentName,
        attachmentMime: jobComments.attachmentMime,
        createdAt: jobComments.createdAt,
      })
      .from(jobComments)
      .where(inArray(jobComments.jobId, jobIds))
      .orderBy(jobComments.jobId, desc(jobComments.id)),
    unreadChatCounts(role, viewerId, jobIds),
  ]);
  const lastByJob = new Map(lastRows.map((r) => [r.jobId, r]));

  return jobRows
    .map((j) => {
      const last = lastByJob.get(j.id);
      const preview = last
        ? last.body.trim() ||
          (attachmentKind(last.attachmentMime ?? "") === "audio" ? "Voice message" : `File: ${last.attachmentName ?? "attachment"}`)
        : "";
      const conversation: ChatConversation = {
        jobId: j.id,
        ref: j.ref,
        title: `${j.service}${j.location ? `, ${j.location}` : ""}`,
        status: j.status,
        clientName: role === "client" ? null : j.clientName,
        unread: unread.get(j.id) ?? 0,
        lastMessage: last
          ? { authorName: last.authorName, preview: preview.slice(0, 120), at: new Date(last.createdAt).toISOString() }
          : null,
      };
      return { conversation, lastAt: last ? new Date(last.createdAt).getTime() : 0, updatedAt: new Date(j.updatedAt).getTime() };
    })
    // Chats with messages first, newest message on top; then jobs with no messages yet, newest job first.
    .sort((a, b) => b.lastAt - a.lastAt || b.updatedAt - a.updatedAt)
    .map((row) => row.conversation);
}

/** The one-line "who is in this chat" note shown at the top of a conversation. */
export async function chatParticipantsNote(participant: ChatParticipant): Promise<string> {
  const { job, role } = participant;
  if (role === "client") {
    return job.assignedInspectorId
      ? "You, JDL Core Operations and your inspector can all see and reply here."
      : "You and JDL Core Operations can see and reply here. Your inspector joins once one is assigned.";
  }
  const database = requireDb();
  const clientRows = await database.select({ name: clients.name }).from(clients).where(eq(clients.id, job.clientId)).limit(1);
  const clientName = clientRows[0]?.name ?? "the client";
  if (role === "inspector") return `Shared with the client (${clientName}) and JDL Core Operations. Both see everything posted here.`;
  if (!job.assignedInspectorId) return `Shared with the client (${clientName}). The inspector joins once one is assigned.`;
  const inspectorRows = await database
    .select({ name: inspectors.name })
    .from(inspectors)
    .where(eq(inspectors.id, job.assignedInspectorId))
    .limit(1);
  return `Shared with the client (${clientName}) and the inspector (${inspectorRows[0]?.name ?? "assigned"}). Both see everything posted here.`;
}

/** Resolves the signed-in person for a role, without tying them to a job (used by the conversation list). */
export async function resolveChatViewer(role: ChatRole): Promise<{ role: ChatRole; id: number } | null> {
  if (role === "client") {
    const client = await getPortalClient();
    return client ? { role, id: client.id } : null;
  }
  if (role === "inspector") {
    const inspector = await getInspector();
    return inspector ? { role, id: inspector.id } : null;
  }
  const staff = await getStaff();
  return staff && (OPS_ROLES as readonly string[]).includes(staff.role) ? { role: "staff", id: staff.id } : null;
}
