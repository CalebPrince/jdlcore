"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, MessagesSquare, X } from "lucide-react";
import { JobChat, type JobChatMessage, type JobChatRole } from "@/components/chat/job-chat";
import { listenForRing } from "@/lib/realtime-client";
import { JOB_STATUS_META, type JobStatus } from "@/lib/jobs";

export type FloatingChatConversation = {
  jobId: number;
  ref: string;
  title: string;
  status: string;
  clientName: string | null;
  unread: number;
  lastMessage: { authorName: string; preview: string; at: string } | null;
};

type RealtimeProps = { url: string; anonKey: string; topic: string } | null;

type Thread = {
  jobId: number;
  ref: string;
  title: string;
  participantsNote: string;
  realtime: RealtimeProps;
  messages: JobChatMessage[];
};

/** How often the unread count is re-checked when the live connection isn't doing it for us. */
const REFRESH_MS = 30000;

const JOB_PATH = /^\/(?:portal|inspector|admin)\/jobs\/(\d+)/;

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });

function shortTime(iso: string): string {
  const date = new Date(iso);
  return date.toDateString() === new Date().toDateString() ? timeFmt.format(date) : dateFmt.format(date);
}

/**
 * The floating group chat: a round button fixed to the bottom-right of every signed-in page, with
 * a red count of unread messages on its corner (like an app icon's notification badge). Pressing
 * it opens a panel with the person's job conversations, or goes straight into the chat of the job
 * they are looking at. The count stays current through the person's Realtime inbox channel, with
 * a periodic check as a fallback.
 */
export function FloatingChat({
  role,
  viewerId,
  initialConversations,
  inboxRealtime,
}: {
  role: JobChatRole;
  viewerId: number;
  initialConversations: FloatingChatConversation[];
  inboxRealtime: RealtimeProps;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const pageJobId = useMemo(() => {
    const match = JOB_PATH.exec(pathname ?? "");
    return match ? Number(match[1]) : null;
  }, [pathname]);

  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState(initialConversations);
  const [thread, setThread] = useState<Thread | null>(null);
  const [loadingJobId, setLoadingJobId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const openJobIdRef = useRef<number | null>(null);

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread, 0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/conversations?as=${role}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { conversations: FloatingChatConversation[] };
      setConversations(data.conversations);
    } catch {
      /* keep the last known list; the next check will try again */
    }
  }, [role]);

  // Keep the badge current: instantly via the inbox channel, and on a slow timer as a fallback.
  const inboxUrl = inboxRealtime?.url;
  const inboxKey = inboxRealtime?.anonKey;
  const inboxTopic = inboxRealtime?.topic;
  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout>;
    const stop =
      inboxUrl && inboxKey && inboxTopic
        ? listenForRing({ url: inboxUrl, anonKey: inboxKey }, inboxTopic, () => {
            clearTimeout(debounce);
            debounce = setTimeout(() => void refresh(), 300);
          })
        : () => {};
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(debounce);
      clearInterval(timer);
      stop();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, inboxUrl, inboxKey, inboxTopic]);

  const openThread = useCallback(
    async (jobId: number) => {
      setError("");
      setLoadingJobId(jobId);
      openJobIdRef.current = jobId;
      try {
        const res = await fetch(`/api/jobs/${jobId}/messages?as=${role}&meta=1`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as {
          messages: JobChatMessage[];
          meta: { ref: string; title: string; participantsNote: string; realtime: RealtimeProps };
        };
        // The person may have gone back or picked another chat while this one was loading.
        if (openJobIdRef.current !== jobId) return;
        setThread({ jobId, ...data.meta, messages: data.messages });
      } catch {
        if (openJobIdRef.current === jobId) setError("Could not open that chat. Please try again.");
      } finally {
        setLoadingJobId((current) => (current === jobId ? null : current));
      }
    },
    [role],
  );

  const backToList = useCallback(() => {
    openJobIdRef.current = null;
    setThread(null);
    setError("");
    void refresh();
  }, [refresh]);

  const openPanel = useCallback(() => {
    setOpen(true);
    void refresh();
    // On a job's page the button goes straight to that job's chat.
    if (pageJobId && openJobIdRef.current !== pageJobId) void openThread(pageJobId);
  }, [refresh, pageJobId, openThread]);

  const closePanel = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);

  // Links that point at "#chat" (emails, the bell, the "new messages" link on a job page) open the panel.
  useEffect(() => {
    const openFromHash = () => {
      if (window.location.hash !== "#chat") return;
      history.replaceState(null, "", window.location.pathname + window.location.search);
      openPanel();
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, [openPanel]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closePanel]);

  const clearUnread = useCallback(
    (jobId: number) => {
      setConversations((list) => list.map((c) => (c.jobId === jobId ? { ...c, unread: 0 } : c)));
      void refresh();
      // The page underneath shows its own unread pills and "new messages" link; bring those up to date too.
      router.refresh();
    },
    [refresh, router],
  );

  const badge = totalUnread > 99 ? "99+" : String(totalUnread);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? closePanel() : openPanel())}
        aria-label={
          open
            ? "Close chat"
            : totalUnread > 0
              ? `Open chat, ${totalUnread} unread message${totalUnread === 1 ? "" : "s"}`
              : "Open chat"
        }
        aria-expanded={open}
        aria-controls="floating-chat-panel"
        className={`fixed right-5 bottom-5 z-[60] flex h-[58px] w-[58px] items-center justify-center rounded-full bg-navy-950 text-gold-500 shadow-[0_10px_30px_rgba(8,24,38,0.35)] transition-transform duration-200 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-600 max-[480px]:right-3.5 max-[480px]:bottom-3.5 ${
          open ? "max-[480px]:hidden" : ""
        }`}
      >
        {open ? <X className="h-6 w-6" aria-hidden="true" /> : <MessagesSquare className="h-6 w-6" aria-hidden="true" />}
        {!open && totalUnread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] leading-none font-bold text-white ring-2 ring-white"
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          id="floating-chat-panel"
          ref={panelRef}
          role="dialog"
          aria-label="Chat"
          tabIndex={-1}
          className="fixed right-5 bottom-[92px] z-[59] flex h-[min(640px,calc(100dvh-120px))] w-[min(400px,calc(100vw-40px))] flex-col overflow-hidden rounded-2xl border bg-white shadow-[0_24px_60px_rgba(8,24,38,0.28)] outline-none max-[480px]:inset-0 max-[480px]:h-auto max-[480px]:w-auto max-[480px]:rounded-none max-[480px]:border-0"
          style={{ borderColor: "var(--border)" }}
        >
          <header className="flex shrink-0 items-center gap-2 bg-navy-950 px-3 py-3 text-white">
            {thread || loadingJobId ? (
              <button
                type="button"
                onClick={backToList}
                className="rounded-full p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
                aria-label="Back to all chats"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            ) : (
              <MessagesSquare className="mx-1.5 h-5 w-5 text-gold-500" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate font-display text-sm font-bold">{thread ? thread.ref : "Chats"}</p>
              <p className="m-0 truncate text-xs text-white/70">
                {thread ? thread.title : "One group chat per job"}
              </p>
            </div>
            <button
              type="button"
              onClick={closePanel}
              className="rounded-full p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
              aria-label="Close chat"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          {thread ? (
            <div className="flex min-h-0 flex-1 flex-col p-3">
              <JobChat
                key={thread.jobId}
                jobId={thread.jobId}
                viewerRole={role}
                viewerId={viewerId}
                initialMessages={thread.messages}
                participantsNote={thread.participantsNote}
                realtime={thread.realtime}
                fill
                onRead={() => clearUnread(thread.jobId)}
              />
            </div>
          ) : loadingJobId ? (
            <p className="m-auto text-sm text-muted-foreground" role="status">
              Opening chat…
            </p>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {error && (
                <p className="m-3 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
                  {error}
                </p>
              )}
              {conversations.length === 0 ? (
                <p className="m-0 p-8 text-center text-sm text-muted-foreground">
                  No chats yet. Each job gets its own group chat as soon as it is created.
                </p>
              ) : (
                <ul className="m-0 list-none p-0">
                  {conversations.map((c) => {
                    const status = JOB_STATUS_META[c.status as JobStatus];
                    return (
                      <li key={c.jobId} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                        <button
                          type="button"
                          onClick={() => void openThread(c.jobId)}
                          className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-paper-deep ${
                            c.unread > 0 ? "bg-[rgba(201,142,18,0.07)]" : ""
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <span className="font-display text-sm font-bold text-gold-700">{c.ref}</span>
                              {status && <span className="truncate text-[11px] text-ink-faint">{status.label}</span>}
                            </div>
                            <p className="m-0 truncate text-sm font-medium text-navy-950">
                              {c.title}
                              {c.clientName ? ` · ${c.clientName}` : ""}
                            </p>
                            <p
                              className={`m-0 mt-0.5 truncate text-xs ${
                                c.unread > 0 ? "font-semibold text-navy-950" : "text-muted-foreground"
                              }`}
                            >
                              {c.lastMessage ? `${c.lastMessage.authorName}: ${c.lastMessage.preview}` : "No messages yet"}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1.5">
                            {c.lastMessage && (
                              <span suppressHydrationWarning className="text-[11px] text-ink-faint">
                                {shortTime(c.lastMessage.at)}
                              </span>
                            )}
                            {c.unread > 0 && (
                              <span
                                className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] leading-none font-bold text-white"
                                aria-label={`${c.unread} unread`}
                              >
                                {c.unread > 99 ? "99+" : c.unread}
                              </span>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
