"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowUp, ExternalLink, Loader2, Menu, PanelLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type AssistantEvidence = { kind: string; label: string; detail: string; link: string | null };
export type AssistantMessage = { role: "user" | "assistant"; content: string; evidence?: AssistantEvidence[] };
type ChatSummary = { id: number; title: string };

const SUGGESTIONS = [
  "What jobs are still awaiting assignment?",
  "Any AI review flags this week?",
  "Show recent stock readings for job JDL-2026-0001.",
  "What reference documents cover collateral verification?",
];

export function AssistantWorkspace({
  staffName,
  chats,
  activeChatId,
  initialMessages,
}: {
  staffName: string;
  chats: ChatSummary[];
  activeChatId: number | null;
  initialMessages: AssistantMessage[];
}) {
  const [messages, setMessages] = useState<AssistantMessage[]>(initialMessages);
  const [chatList, setChatList] = useState<ChatSummary[]>(chats);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentChatId, setCurrentChatId] = useState<number | null>(activeChatId);
  const [historyOpen, setHistoryOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    setInput("");
    setMessages((m) => [...m, { role: "user", content: trimmed }, { role: "assistant", content: "" }]);
    try {
      const res = await fetch("/api/admin/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chatId: currentChatId ?? undefined, message: trimmed }),
      });
      const data = (await res.json()) as {
        reply?: string;
        chatId?: number;
        error?: string;
        evidence?: AssistantEvidence[];
      };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setMessages((m) => m.slice(0, -1));
      } else {
        if (data.chatId && data.chatId !== currentChatId) {
          setCurrentChatId(data.chatId);
          setChatList((items) =>
            items.some((item) => item.id === data.chatId)
              ? items
              : [{ id: data.chatId!, title: trimmed.slice(0, 60) }, ...items],
          );
          router.replace(`/admin/assistant?c=${data.chatId}`);
        }
        setMessages((m) => {
          const next = [...m];
          next[next.length - 1] = { role: "assistant", content: data.reply ?? "", evidence: data.evidence };
          return next;
        });
      }
    } catch {
      setError("Network error — check your connection and try again.");
      setMessages((m) => m.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  function startNewChat() {
    setCurrentChatId(null);
    setMessages([]);
    setError(null);
    router.push("/admin/assistant?new=1");
    taRef.current?.focus();
  }

  function switchChat(id: number) {
    router.push(`/admin/assistant?c=${id}`);
  }

  return (
    <div className="flex h-[calc(100dvh-57px)] flex-col bg-white/40 lg:h-dvh lg:flex-row">
      {/* Mobile top bar */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b bg-white/80 px-3 backdrop-blur-xl lg:hidden" style={{ borderColor: "var(--border)" }}>
        <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="size-10 rounded-full" aria-label="Open conversation history">
              <PanelLeft aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex w-[min(320px,88vw)] flex-col p-0">
            <SheetHeader className="border-b px-5 py-5 text-left" style={{ borderColor: "var(--border)" }}>
              <SheetTitle>Conversations</SheetTitle>
            </SheetHeader>
            <HistoryList
              chats={chatList}
              currentChatId={currentChatId}
              onNew={() => {
                startNewChat();
                setHistoryOpen(false);
              }}
              onSwitch={(id) => {
                switchChat(id);
                setHistoryOpen(false);
              }}
            />
          </SheetContent>
        </Sheet>
        <span className="font-display text-sm font-bold text-navy-950">Operations Assistant</span>
        <Button variant="ghost" size="icon" className="size-10 rounded-full opacity-0" aria-hidden="true">
          <Menu />
        </Button>
      </div>

      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col gap-3 border-r bg-white/70 p-4 lg:flex" style={{ borderColor: "var(--border)" }}>
        <Button onClick={startNewChat} variant="outline" size="sm" className="justify-start gap-2">
          <Plus className="h-4 w-4" /> New conversation
        </Button>
        <p className="m-0 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">History</p>
        <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
          <HistoryList chats={chatList} currentChatId={currentChatId} onNew={startNewChat} onSwitch={switchChat} hideNew />
        </div>
      </aside>

      {/* Conversation */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          <div className="mx-auto max-w-3xl">
            {messages.length === 0 ? (
              <div className="pt-4 pb-4">
                <h1 className="font-display text-xl font-bold text-navy-950 sm:text-2xl">
                  Hi {staffName.split(" ")[0]}, ask about jobs, flags, stock, or documents.
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  This is a read-only lookup tool — every answer is grounded in evidence from the platform
                  and links back to the record. It cannot change anything.
                </p>
                <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      disabled={busy}
                      className="rounded-[var(--radius)] border bg-white p-3.5 text-left text-xs leading-relaxed text-ink-soft shadow-sm transition-all hover:border-gold-600 hover:text-navy-950 disabled:opacity-50"
                      style={{ borderColor: "var(--border)" }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {messages.map((m, i) => (
                  <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-[var(--radius)] px-4 py-3 text-sm leading-relaxed",
                        m.role === "user" ? "bg-navy-950 text-paper" : "border bg-white text-ink",
                      )}
                      style={m.role === "assistant" ? { borderColor: "var(--border)" } : undefined}
                    >
                      {m.role === "assistant" && !m.content ? (
                        <span className="inline-flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking this up…
                        </span>
                      ) : (
                        <>
                          <Markdownish text={m.content} />
                          {m.role === "assistant" && m.evidence && m.evidence.length > 0 && (
                            <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
                              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Evidence</p>
                              <div className="flex flex-col gap-1.5">
                                {m.evidence.map((item, itemIndex) => (
                                  <div key={`${item.kind}-${itemIndex}`} className="rounded-md bg-navy-50 px-2.5 py-1.5 text-[11px] text-navy-800">
                                    <span className="font-semibold">[Ref {itemIndex + 1}] {item.label}</span>
                                    {item.link ? (
                                      <Link href={item.link} className="ml-1.5 inline-flex items-center gap-0.5 font-semibold text-gold-700 hover:underline">
                                        Open <ExternalLink className="h-2.5 w-2.5" />
                                      </Link>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {error && (
                  <p className="m-0 rounded-lg bg-red-50 px-4 py-2.5 text-center text-xs font-semibold text-red-700">{error}</p>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="border-t bg-white px-4 py-4 sm:px-8" style={{ borderColor: "var(--border)" }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="mx-auto flex max-w-3xl items-end gap-2"
          >
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder="Ask about a job, flag, stock reading, or document…"
              className="max-h-40 min-h-[46px] flex-1 resize-none rounded-[var(--radius)] border-[1.5px] bg-white px-4 py-3 text-sm focus:border-gold-600 focus:outline-none"
              style={{ borderColor: "var(--border)" }}
            />
            <Button type="submit" size="icon" disabled={busy || !input.trim()} className="btn-gold h-[46px] w-[46px] shrink-0 rounded-full p-0" aria-label="Send">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4.5 w-4.5" />}
            </Button>
          </form>
          <p className="mx-auto mt-2 max-w-3xl text-center text-[10px] text-muted-foreground">
            Read-only — cannot approve, assign, or notify anyone. Verify anything critical against the linked record.
          </p>
        </div>
      </div>
    </div>
  );
}

function HistoryList({
  chats,
  currentChatId,
  onNew,
  onSwitch,
  hideNew,
}: {
  chats: ChatSummary[];
  currentChatId: number | null;
  onNew: () => void;
  onSwitch: (id: number) => void;
  hideNew?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 p-3 lg:p-0">
      {!hideNew && (
        <Button onClick={onNew} variant="outline" size="sm" className="mb-2 justify-start gap-2">
          <Plus className="h-4 w-4" /> New conversation
        </Button>
      )}
      {chats.length === 0 && <p className="px-1 text-xs text-muted-foreground">No conversations yet.</p>}
      {chats.map((chat) => (
        <button
          key={chat.id}
          type="button"
          onClick={() => onSwitch(chat.id)}
          className={cn(
            "truncate rounded-md px-3 py-2 text-left text-xs transition-colors",
            chat.id === currentChatId ? "bg-navy-950 text-paper" : "text-ink-soft hover:bg-navy-50",
          )}
          title={chat.title}
        >
          {chat.title}
        </button>
      ))}
    </div>
  );
}

/** Minimal markdown: bold, bullets, headings, paragraphs. */
function Markdownish({ text }: { text: string }) {
  const blocks = text.split(/\n\n+/);
  return (
    <div className="flex flex-col gap-2.5">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        const isBullets = lines.every((l) => /^\s*[-•*]\s+/.test(l));
        if (isBullets) {
          return (
            <ul key={i} className="m-0 flex list-disc flex-col gap-1 pl-4">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-•*]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        const heading = block.match(/^(#{1,4})\s+(.*)/);
        if (heading) {
          return (
            <p key={i} className="m-0 mt-1 text-sm font-bold text-navy-950">
              {inline(heading[2])}
            </p>
          );
        }
        return (
          <p key={i} className="m-0 whitespace-pre-wrap">
            {inline(block)}
          </p>
        );
      })}
    </div>
  );
}

function inline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
}
