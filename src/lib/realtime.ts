import "server-only";
import { createHmac } from "node:crypto";

/**
 * Supabase Realtime, used only as a doorbell for the job chat.
 *
 * This app signs people in with its own session cookies, not Supabase Auth, so the browser can't
 * be trusted with table access. Instead the server "rings" a channel when a message is posted and
 * the open chat then fetches the new messages through our own API, which checks the session as
 * usual. Nothing private travels over Realtime: the ring carries no message content, and channel
 * names are derived from a server secret, so they can't be guessed and are only handed to people
 * already allowed into that chat.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (the project's public
 * "anon"/publishable key). Without them everything still works; the chat falls back to checking
 * for new messages every few seconds.
 */

export type RealtimeConfig = { url: string; anonKey: string };

export function realtimeConfig(): RealtimeConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

function topicFor(kind: string, key: string): string {
  const secret = `realtime:${process.env.SESSION_SECRET ?? "jdlcore-dev-secret-change-me"}`;
  return `${kind}-${createHmac("sha256", secret).update(`${kind}:${key}`).digest("hex").slice(0, 32)}`;
}

/** The channel an open job chat listens on. */
export const chatTopic = (jobId: number) => topicFor("job-chat", String(jobId));

/**
 * The channel a person's job lists listen on, so unread badges update without a reload. All
 * Operations staff share one; each client and inspector has their own.
 */
export const inboxTopic = (role: "client" | "staff" | "inspector", id: number) =>
  topicFor("chat-inbox", role === "staff" ? "staff" : `${role}:${id}`);

export const REALTIME_EVENT = "new";

/** Rings the given channels. Never throws and never holds a request up for more than a moment. */
export async function ring(topics: string[]): Promise<void> {
  const config = realtimeConfig();
  if (!config || topics.length === 0) return;
  try {
    const res = await fetch(`${config.url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
      },
      body: JSON.stringify({ messages: topics.map((topic) => ({ topic, event: REALTIME_EVENT, payload: {} })) }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) console.error("realtime ring:", res.status, (await res.text()).slice(0, 200));
  } catch (err) {
    console.error("realtime ring:", err);
  }
}
