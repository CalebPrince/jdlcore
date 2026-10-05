"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileText, Mic, Paperclip, SendHorizontal, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { listenForRing } from "@/lib/realtime-client";

export type JobChatRole = "client" | "staff" | "inspector";

export type JobChatAttachment = { name: string; mimeType: string; sizeBytes: number; kind: "audio" | "image" | "file" };

export type JobChatMessage = {
  id: number;
  authorType: string;
  authorId: number | null;
  authorName: string;
  body: string;
  createdAt: string | Date;
  attachment: JobChatAttachment | null;
};

/** How often to check for new messages when the live connection isn't available. */
const POLL_MS = 4000;
/** With the live connection up, a slow check remains as a safety net for a missed ring. */
const LIVE_SAFETY_POLL_MS = 30000;
const MAX_LENGTH = 2000;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_RECORDING_SECONDS = 300;
const ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.png,.jpg,.jpeg,.webp,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.webm";

/** Recording formats to try, in order; the first one this browser can record wins. */
const RECORDING_FORMATS = [
  { mimeType: "audio/webm;codecs=opus", ext: "webm" },
  { mimeType: "audio/webm", ext: "webm" },
  { mimeType: "audio/mp4", ext: "m4a" },
  { mimeType: "audio/ogg;codecs=opus", ext: "ogg" },
];

const ROLE_BADGE: Record<string, { label: string; className: string }> = {
  staff: { label: "Operations", className: "bg-navy-100 text-navy-800" },
  inspector: { label: "Inspector", className: "bg-[rgba(201,142,18,0.14)] text-gold-700" },
  client: { label: "Client", className: "bg-[rgba(31,122,77,0.12)] text-[#1f7a4d]" },
};

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short" });

function dayLabel(date: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return dayFmt.format(date);
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const formatClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/**
 * The job's group chat between the client, Operations and the assigned inspector. Starts from the
 * server-rendered messages and stays current through Supabase Realtime: the server rings this
 * job's channel when anyone posts, and the chat then fetches the new messages through the app's
 * own signed-in API. If the live connection isn't set up or drops, it checks every few seconds
 * instead. A message can carry one document, picture or voice note. While the chat is on screen
 * it also records how far the viewer has read, which clears their unread badge.
 */
export function JobChat({
  jobId,
  viewerRole,
  viewerId,
  initialMessages,
  participantsNote,
  realtime,
}: {
  jobId: number;
  viewerRole: JobChatRole;
  viewerId: number;
  initialMessages: JobChatMessage[];
  /** One line telling the viewer who else is in this chat. */
  participantsNote: string;
  /** Live connection details for this job's channel; null when Realtime isn't configured. */
  realtime?: { url: string; anonKey: string; topic: string } | null;
}) {
  const [messages, setMessages] = useState<JobChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const [recording, setRecording] = useState(false);
  const [askingForMic, setAskingForMic] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastIdRef = useRef(initialMessages.reduce((max, m) => Math.max(max, m.id), 0));
  const stickToBottomRef = useRef(true);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const discardRecordingRef = useRef(false);
  const liveRef = useRef(false);
  const realtimeUrl = realtime?.url;
  const realtimeKey = realtime?.anonKey;
  const realtimeTopic = realtime?.topic;
  const inViewRef = useRef(false);
  const markedReadRef = useRef(0);

  const merge = useCallback((incoming: JobChatMessage[]) => {
    if (incoming.length === 0) return;
    setMessages((current) => {
      const seen = new Set(current.map((m) => m.id));
      const fresh = incoming.filter((m) => !seen.has(m.id));
      if (fresh.length === 0) return current;
      return [...current, ...fresh].sort((a, b) => a.id - b.id);
    });
    lastIdRef.current = Math.max(lastIdRef.current, ...incoming.map((m) => m.id));
  }, []);

  // Tells the server how far this viewer has read, but only while the chat is actually on screen.
  const markRead = useCallback(() => {
    const lastId = lastIdRef.current;
    if (!inViewRef.current || document.visibilityState !== "visible" || lastId <= markedReadRef.current) return;
    markedReadRef.current = lastId;
    void fetch(`/api/jobs/${jobId}/messages/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ as: viewerRole, lastId }),
      keepalive: true,
    }).catch(() => {
      markedReadRef.current = 0;
    });
  }, [jobId, viewerRole]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let inFlight = false;

    async function fetchNew() {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const res = await fetch(`/api/jobs/${jobId}/messages?as=${viewerRole}&after=${lastIdRef.current}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { messages: JobChatMessage[] };
        if (!cancelled) {
          merge(data.messages);
          setOffline(false);
        }
      } catch {
        if (!cancelled) setOffline(true);
      } finally {
        inFlight = false;
      }
    }

    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await fetchNew();
        if (!cancelled) schedule();
      }, liveRef.current ? LIVE_SAFETY_POLL_MS : POLL_MS);
    }

    schedule();
    const stopListening = realtimeUrl && realtimeKey && realtimeTopic
      ? listenForRing(
          { url: realtimeUrl, anonKey: realtimeKey },
          realtimeTopic,
          () => void fetchNew(),
          (connected) => {
            if (cancelled || liveRef.current === connected) return;
            liveRef.current = connected;
            // Just connected: catch anything posted while connecting. Just dropped: back to fast checks.
            if (connected) void fetchNew();
            schedule();
          },
        )
      : () => {};
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void fetchNew();
        schedule();
        markRead();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      stopListening();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [jobId, viewerRole, merge, markRead, realtimeUrl, realtimeKey, realtimeTopic]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        inViewRef.current = entry.isIntersecting;
        if (entry.isIntersecting) markRead();
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [markRead]);

  // Follow new messages, unless the reader has scrolled up to read older ones.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
    markRead();
  }, [messages, markRead]);

  // Leaving the page mid-recording must release the microphone.
  useEffect(() => {
    return () => {
      discardRecordingRef.current = true;
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
    };
  }, []);

  function chooseFile(next: File | null) {
    setError("");
    if (next && next.size > MAX_FILE_BYTES) {
      setError("That file is larger than 4 MB.");
      return;
    }
    setFile(next);
  }

  async function startRecording() {
    setError("");
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't record audio. Attach an audio file instead.");
      return;
    }
    const format = RECORDING_FORMATS.find((f) => MediaRecorder.isTypeSupported(f.mimeType));
    // Asking for the microphone is what makes the browser show its own permission prompt. Nothing
    // is recorded until the person allows it, and the microphone is released when recording stops.
    let stream: MediaStream;
    setAskingForMic(true);
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setError(
        name === "NotFoundError" || name === "OverconstrainedError"
          ? "No microphone was found on this device. Attach an audio file instead."
          : name === "NotAllowedError" || name === "SecurityError"
            ? "Microphone access is blocked for this site. Click the padlock or site settings icon in the address bar, set Microphone to Allow, then press the mic button again."
            : "The microphone could not be started. Close other apps using it and try again.",
      );
      return;
    } finally {
      setAskingForMic(false);
    }
    const recorder = new MediaRecorder(stream, format ? { mimeType: format.mimeType, audioBitsPerSecond: 32000 } : undefined);
    const chunks: Blob[] = [];
    discardRecordingRef.current = false;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      recorderRef.current = null;
      if (discardRecordingRef.current) return;
      setRecording(false);
      const type = (recorder.mimeType || format?.mimeType || "audio/webm").split(";")[0];
      const ext = format?.ext ?? (type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm");
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
      const blob = new Blob(chunks, { type });
      if (blob.size === 0) return;
      chooseFile(new File([blob], `voice-message-${stamp}.${ext}`, { type }));
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecordSeconds(0);
    setRecording(true);
    recordTimerRef.current = setInterval(() => {
      setRecordSeconds((s) => {
        if (s + 1 >= MAX_RECORDING_SECONDS && recorder.state !== "inactive") recorder.stop();
        return s + 1;
      });
    }, 1000);
  }

  function stopRecording(discard: boolean) {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    discardRecordingRef.current = discard;
    if (discard) setRecording(false);
    recorder.stop();
  }

  async function send() {
    const body = draft.trim();
    if ((!body && !file) || sending || recording) return;
    setSending(true);
    setError("");
    try {
      const form = new FormData();
      form.set("as", viewerRole);
      form.set("body", body);
      if (file) form.set("file", file, file.name);
      const res = await fetch(`/api/jobs/${jobId}/messages`, { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { message?: JobChatMessage; error?: string };
      if (!res.ok || !data.message) {
        setError(
          res.status === 404 || res.status === 403
            ? "You no longer have access to this chat. Refresh the page and sign in again."
            : res.status === 413
              ? "That file is larger than 4 MB."
              : (data.error ?? "Could not send. Please try again."),
        );
        return;
      }
      stickToBottomRef.current = true;
      merge([data.message]);
      setDraft("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      setError("Could not send. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  const attachmentUrl = (messageId: number) => `/api/jobs/${jobId}/messages/${messageId}/attachment?as=${viewerRole}`;
  const canSend = !sending && !recording && (draft.trim().length > 0 || file !== null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="m-0 text-xs text-muted-foreground">{participantsNote}</p>
        <p className="m-0 flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${offline ? "bg-red-500" : "bg-[#1f7a4d]"}`} />
          {offline ? "Reconnecting" : "Live"}
        </p>
      </div>

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        className="flex max-h-[26rem] min-h-40 flex-col gap-2.5 overflow-y-auto rounded-xl border bg-[#f4f5f2] p-3 sm:p-4"
        style={{ borderColor: "var(--border)" }}
        role="log"
        aria-label="Job chat messages"
      >
        {messages.length === 0 && (
          <p className="m-auto max-w-xs text-center text-sm text-muted-foreground">
            No messages yet. Start the conversation below.
          </p>
        )}
        {messages.map((m, i) => {
          const mine = m.authorType === viewerRole && m.authorId === viewerId;
          const badge = ROLE_BADGE[m.authorType] ?? ROLE_BADGE.staff;
          const created = new Date(m.createdAt);
          const day = dayLabel(created);
          const showDay = i === 0 || dayLabel(new Date(messages[i - 1].createdAt)) !== day;
          const bubble = mine ? "rounded-tr-sm bg-navy-950 text-white" : "rounded-tl-sm border bg-white text-navy-950";
          return (
            <div key={m.id} className="flex flex-col gap-2.5">
              {showDay && (
                <p
                  suppressHydrationWarning
                  className="m-0 self-center rounded-full bg-white px-3 py-0.5 text-[11px] font-semibold text-ink-faint"
                >
                  {day}
                </p>
              )}
              <div className={`flex max-w-[85%] flex-col gap-1 ${mine ? "self-end items-end" : "self-start items-start"}`}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-xs font-semibold text-navy-950">{mine ? "You" : m.authorName}</span>
                  {!mine && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge.className}`}>
                      {badge.label}
                    </span>
                  )}
                  <span suppressHydrationWarning className="text-[11px] text-ink-faint">
                    {timeFmt.format(created)}
                  </span>
                </div>
                {m.attachment?.kind === "audio" && (
                  <div
                    className="flex max-w-full flex-col gap-1.5 rounded-2xl border bg-white p-2"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <audio controls preload="none" src={`${attachmentUrl(m.id)}&inline=1`} className="h-10 w-64 max-w-full" />
                    <a
                      href={attachmentUrl(m.id)}
                      className="inline-flex items-center gap-1 self-start px-1 text-[11px] font-semibold text-navy-700 underline-offset-2 hover:underline"
                    >
                      <Download className="h-3 w-3" /> {m.attachment.name} ({formatSize(m.attachment.sizeBytes)})
                    </a>
                  </div>
                )}
                {m.attachment && m.attachment.kind !== "audio" && (
                  <a
                    href={attachmentUrl(m.id)}
                    className="flex max-w-full items-center gap-2.5 rounded-2xl border bg-white px-3 py-2 text-navy-950 transition-colors hover:bg-navy-50"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <FileText className="h-5 w-5 shrink-0 text-navy-700" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{m.attachment.name}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {formatSize(m.attachment.sizeBytes)} · Download
                      </span>
                    </span>
                    <Download className="h-4 w-4 shrink-0 text-navy-700" />
                  </a>
                )}
                {m.body && (
                  <p
                    className={`m-0 whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${bubble}`}
                    style={mine ? undefined : { borderColor: "var(--border)" }}
                  >
                    {m.body}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {askingForMic && (
        <p
          className="m-0 rounded-xl border bg-white px-3 py-2 text-sm text-navy-950"
          style={{ borderColor: "var(--border)" }}
          role="status"
        >
          Your browser is asking for microphone access. Choose Allow to start recording your voice message.
        </p>
      )}

      {recording && (
        <div
          className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="status"
        >
          <span aria-hidden="true" className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" />
          <span className="flex-1 font-semibold tabular-nums">
            Recording {formatClock(recordSeconds)} of {formatClock(MAX_RECORDING_SECONDS)}
          </span>
          <Button type="button" size="sm" variant="ghost" onClick={() => stopRecording(true)}>
            Discard
          </Button>
          <Button type="button" size="sm" className="btn-gold" onClick={() => stopRecording(false)}>
            <Square className="h-3.5 w-3.5" /> Stop
          </Button>
        </div>
      )}

      {file && !recording && (
        <div
          className="flex items-center gap-2.5 rounded-xl border bg-white px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)" }}
        >
          {file.type.startsWith("audio/") ? (
            <Mic className="h-4 w-4 shrink-0 text-navy-700" />
          ) : (
            <FileText className="h-4 w-4 shrink-0 text-navy-700" />
          )}
          <span className="min-w-0 flex-1 truncate font-medium text-navy-950">{file.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{formatSize(file.size)}</span>
          <button
            type="button"
            onClick={() => {
              setFile(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-navy-50 hover:text-navy-950"
            aria-label="Remove attachment"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
        />
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11"
            disabled={sending || recording || askingForMic}
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach a document, picture or audio file"
            title="Attach a document, picture or audio file (up to 4 MB)"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11"
            disabled={sending || recording || askingForMic}
            onClick={() => void startRecording()}
            aria-label="Record a voice message"
            title="Record a voice message"
          >
            <Mic className="h-4 w-4" />
          </Button>
        </div>
        <label htmlFor={`chat-input-${jobId}`} className="sr-only">
          Message
        </label>
        <Textarea
          id={`chat-input-${jobId}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          maxLength={MAX_LENGTH}
          placeholder="Write a message. Enter sends, Shift+Enter adds a line."
          className="min-h-11 flex-1 resize-none bg-white"
        />
        <Button type="submit" disabled={!canSend} className="btn-gold h-11 shrink-0">
          <SendHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">{sending ? "Sending…" : "Send"}</span>
          <span className="sr-only sm:hidden">Send</span>
        </Button>
      </form>
      {error && (
        <p className="m-0 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
