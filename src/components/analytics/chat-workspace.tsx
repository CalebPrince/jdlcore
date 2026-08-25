"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, BookOpen, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ChatSummary = { id: number; title: string };
export type ChatSource = { docId: number; title: string; quote: string };
export type ChatMessage = { role: "user" | "assistant"; content: string; sources?: ChatSource[] };

const SUGGESTIONS = [
  "Explain how a quantity certification protects a lender.",
  "What should I check before accepting a cargo discharge?",
  "Draft a stock discrepancy report outline for my MD.",
  "How does collateral monitoring work for fuel depots?",
];

export function ChatWorkspace({
  userName,
  chats,
  activeChatId,
  initialMessages,
}: {
  userName: string;
  chats: ChatSummary[];
  activeChatId: number | null;
  initialMessages: ChatMessage[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentChatId, setCurrentChatId] = useState<number | null>(activeChatId);
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
      const res = await fetch("/api/analytics/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chatId: currentChatId ?? undefined, message: trimmed }),
      });
      const data = (await res.json()) as {
        reply?: string;
        chatId?: number;
        error?: string;
        sources?: ChatSource[];
      };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setMessages((m) => m.slice(0, -1));
      } else {
        if (data.chatId && data.chatId !== currentChatId) setCurrentChatId(data.chatId);
        setMessages((m) => {
          const next = [...m];
          next[next.length - 1] = { role: "assistant", content: data.reply ?? "", sources: data.sources };
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
    taRef.current?.focus();
  }

  function switchChat(id: number) {
    router.push(`/analytics/app?c=${id}`);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 gap-0 overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col gap-3 border-r bg-white/60 p-4 md:flex" style={{ borderColor: "var(--border)" }}>
        <Button onClick={startNewChat} variant="outline" size="sm" className="justify-start gap-2">
          <Plus className="h-4 w-4" /> New chat
        </Button>
        <p className="m-0 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          History
        </p>
        <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
          {chats.length === 0 && (
            <p className="m-0 text-xs text-muted-foreground">No conversations yet.</p>
          )}
          {chats.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => switchChat(c.id)}
              className={cn(
                "truncate rounded-md px-3 py-2 text-left text-xs transition-colors",
                c.id === currentChatId
                  ? "bg-navy-950 font-semibold text-paper"
                  : "text-ink-soft hover:bg-navy-50",
              )}
              title={c.title}
            >
              {c.title}
            </button>
          ))}
        </div>
      </aside>

      {/* Conversation */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          <div className="mx-auto max-w-3xl">
            {messages.length === 0 ? (
              <div className="pt-8 pb-4">
                <h1 className="font-display text-xl font-bold text-navy-950 sm:text-2xl">
                  Good to see you, {userName.split(" ")[0]}.
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Ask anything about downstream operations, quantities,
                  reconciliation — or your own inspection work.
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
                  <div
                    key={i}
                    className={cn(
                      "flex",
                      m.role === "user" ? "justify-end" : "justify-start",
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-[var(--radius)] px-4 py-3 text-sm leading-relaxed",
                        m.role === "user"
                          ? "bg-navy-950 text-paper"
                          : "border bg-white text-ink",
                      )}
                      style={m.role === "assistant" ? { borderColor: "var(--border)" } : undefined}
                    >
                      {m.role === "assistant" && !m.content ? (
                        <span className="inline-flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
                        </span>
                      ) : (
                        <>
                          <Markdownish text={m.content} />
                          {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                            <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
                              <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><BookOpen className="h-3 w-3" /> Sources</p>
                              <div className="flex flex-wrap gap-1.5">
                                {m.sources.map((source, sourceIndex) => (
                                  <span key={`${source.docId}-${sourceIndex}`} title={source.quote} className="rounded-full bg-navy-50 px-2 py-1 text-[10px] font-semibold text-navy-800">[Doc {sourceIndex + 1}] {source.title}</span>
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
                  <p className="m-0 rounded-lg bg-red-50 px-4 py-2.5 text-center text-xs font-semibold text-red-700">
                    {error}
                  </p>
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
            className="mx-auto flex items-end gap-2"
          >
            <div className="relative flex-1 md:hidden">
              <MobileMenu onStartNew={startNewChat} />
            </div>
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
              placeholder="Ask your question…"
              className="max-h-40 min-h-[46px] flex-1 resize-none rounded-[var(--radius)] border-[1.5px] bg-white px-4 py-3 text-sm focus:border-gold-600 focus:outline-none"
              style={{ borderColor: "var(--border)" }}
            />
            <Button
              type="submit"
              size="icon"
              disabled={busy || !input.trim()}
              className="btn-gold h-[46px] w-[46px] shrink-0 rounded-full p-0"
              aria-label="Send"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4.5 w-4.5" />}
            </Button>
          </form>
          <p className="mx-auto mt-2 max-w-3xl text-center text-[10px] text-muted-foreground">
            Beta — answers are AI-generated. Verify critical figures with your JDL Core account manager.
          </p>
        </div>
      </div>
    </div>
  );
}

function MobileMenu({ onStartNew }: { onStartNew: () => void }) {
  return (
    <Button type="button" onClick={onStartNew} variant="outline" size="sm" className="h-[46px] shrink-0 rounded-full px-3">
      <Plus className="h-4 w-4" />
    </Button>
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
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      part
    ),
  );
}
