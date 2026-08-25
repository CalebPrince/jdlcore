"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { submitChatHandoff, type FormState } from "@/app/actions/submissions";

const ASSISTANT_NAME = "JDL Core Assistant";

type QuickReply = { label: string; href: string } | string;

type Reply = {
  text: string;
  quickReplies?: QuickReply[];
  handoff?: boolean;
};

const MAIN_MENU: QuickReply[] = [
  "Our Services",
  "Request an Inspection",
  "How It Works",
  "Track My Request",
  "Talk to a Person",
];

const GREETING: Reply = {
  text: `Hi, I'm the ${ASSISTANT_NAME}. Ask me anything about JDL Core, or pick an option below.`,
  quickReplies: MAIN_MENU,
};

const AI_CHIPS: QuickReply[] = [
  "Our Services",
  "Request an Inspection",
  "How It Works",
  "Talk to a Person",
];

const SERVICES = [
  "Stock Monitoring",
  "Collateral Verification",
  "Tank & Depot Inspections",
  "Quantity Verification",
  "Reconciliation & Exception Reporting",
  "Loading & Discharge Supervision",
  "Inventory Audit Support",
  "Loss & Discrepancy Investigation",
  "Documentation & Reporting",
  "Stock Control Advisory",
];

const rules: { test: RegExp; reply: () => Reply }[] = [
  {
    test: /service|offer|what do you do|inspect/i,
    reply: () => ({
      text: `We provide ten inspection and verification services: ${SERVICES.join(", ")}.`,
      quickReplies: ["Request an Inspection", "How It Works", "Talk to a Person"],
    }),
  },
  {
    test: /request|quote|price|pricing|cost|book|hire/i,
    reply: () => ({
      text: "You can submit a request with job details on our quote form and we'll follow up to confirm scope and pricing.",
      quickReplies: [
        { label: "Open Request Form", href: "/inspection#quote" },
        "How It Works",
        "Talk to a Person",
      ],
    }),
  },
  {
    test: /how.*work|process|steps|turnaround/i,
    reply: () => ({
      text: "Six steps: Request → Assignment → Inspection → Verification → Review → Report. Every job follows the same process.",
      quickReplies: ["Request an Inspection", "Talk to a Person"],
    }),
  },
  {
    test: /track|status|portal|dashboard|invoice/i,
    reply: () => ({
      text: "A client portal for tracking requests, reports and invoices is in development. For now, our team can update you directly.",
      quickReplies: ["Talk to a Person", "Our Services"],
    }),
  },
  {
    test: /analytics|chatbot|industry data/i,
    reply: () => ({
      text: "JDL Core Analytics — a subscription assistant for industry data — is coming soon.",
      quickReplies: [
        { label: "Preview Analytics", href: "/analytics" },
        "Our Services",
      ],
    }),
  },
  {
    test: /academy|course|tutorial|training|learn|practice test/i,
    reply: () => ({
      text: "JDL Core Academy — tutorials and practice tests for the oil & gas value chain — is coming soon.",
      quickReplies: [
        { label: "Preview Academy", href: "/academy" },
        "Our Services",
      ],
    }),
  },
  {
    test: /human|person|agent|talk|call|contact|speak|complain/i,
    reply: () => ({ text: "Sure — here are two ways to reach the team.", handoff: true }),
  },
  {
    test: /thanks|thank you|cheers/i,
    reply: () => ({
      text: "Any time — anything else I can help with?",
      quickReplies: MAIN_MENU,
    }),
  },
  {
    test: /^(hi|hey|hello|good (morning|afternoon|evening))\b/i,
    reply: () => ({ text: "Hello — what can I help with?", quickReplies: MAIN_MENU }),
  },
];

function respond(input: string): Reply {
  const text = input.trim();
  if (!text) return { text: "Try one of the options below.", quickReplies: MAIN_MENU };
  for (const rule of rules) {
    if (rule.test.test(text)) return rule.reply();
  }
  return {
    text: "I didn't quite catch that. Try one of the options below, or talk to a person.",
    quickReplies: MAIN_MENU,
  };
}

const initialFormState: FormState = { ok: false, message: "" };

function HandoffPanel({ phoneHref }: { phoneHref: string }) {
  const [state, action, pending] = useActionState(submitChatHandoff, initialFormState);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  return (
    <div className="self-stretch rounded-[var(--radius-sm)] border bg-white p-3.5 flex flex-col gap-2.5" style={{ borderColor: "var(--border)" }}>
      <a className="btn-gold w-full" href={phoneHref}>
        Call the Team
      </a>
      <p className="m-0 text-center text-[0.7rem] tracking-[0.05em] uppercase text-ink-faint">
        or leave your details
      </p>
      <form action={action} className="flex flex-col gap-2">
        <input name="name" placeholder="Your name" required className="rounded-[var(--radius-sm)] border bg-paper px-3 py-2 text-[0.85rem] focus:border-gold-600 focus:outline-none" style={{ borderColor: "var(--border)" }} />
        <input name="contact" placeholder="Phone or email" required className="rounded-[var(--radius-sm)] border bg-paper px-3 py-2 text-[0.85rem] focus:border-gold-600 focus:outline-none" style={{ borderColor: "var(--border)" }} />
        <textarea name="note" rows={2} placeholder="Anything to add (optional)" className="rounded-[var(--radius-sm)] border bg-paper px-3 py-2 text-[0.85rem] focus:border-gold-600 focus:outline-none" style={{ borderColor: "var(--border)" }} />
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className="btn-gold px-[1.1em] py-[0.55em] text-[0.82rem] disabled:opacity-55">
            {pending ? "Sending…" : "Send"}
          </button>
          <button type="button" onClick={() => setDismissed(true)} className="btn-ghost px-[1.1em] py-[0.55em] text-[0.82rem]">
            Cancel
          </button>
        </div>
        <p className="m-0 min-h-[1.2em] text-[0.78rem] text-ink-soft" role="status" aria-live="polite">
          {state.message}
        </p>
      </form>
    </div>
  );
}

export function ChatWidget({ phoneHref = "tel:+000000000000" }: { phoneHref?: string }) {
  const [open, setOpen] = useState(false);
  const [greeted, setGreeted] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [quickReplies, setQuickReplies] = useState<QuickReply[] | null>(null);
  const [showHandoff, setShowHandoff] = useState(false);
  const [typing, setTyping] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const statusCheckedRef = useRef(false);

  useEffect(() => {
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, quickReplies, showHandoff, typing]);

  function pushReply(reply: Reply) {
    setTyping(false);
    if (reply.text) {
      setMessages((m) => [...m, { role: "assistant", text: reply.text }]);
    }
    if (reply.handoff) {
      setShowHandoff(true);
      setQuickReplies(null);
    } else if (reply.quickReplies) {
      setQuickReplies(reply.quickReplies);
    }
  }

  function checkAiStatus() {
    if (statusCheckedRef.current) return;
    statusCheckedRef.current = true;
    fetch("/api/chat/status")
      .then((r) => (r.ok ? r.json() : { aiEnabled: false }))
      .then((d: { aiEnabled?: boolean }) => setAiAvailable(Boolean(d.aiEnabled)))
      .catch(() => setAiAvailable(false));
  }

  async function sendAi(clean: string, history: { role: "user" | "assistant"; text: string }[]) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 50_000);
      const res = await fetch("/api/chat/message", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: clean,
          history: history.slice(-20).map((m) => ({ role: m.role, content: m.text })),
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(String(res.status));
      const data: { reply?: string | null; mode?: string } = await res.json();
      if (data.mode === "ai" && data.reply) {
        pushReply({ text: data.reply, quickReplies: AI_CHIPS });
        return;
      }
      pushReply(respond(clean));
    } catch {
      pushReply(respond(clean));
    }
  }

  function send(text: string) {
    const clean = text.trim();
    if (!clean || typing) return;
    const history = messages;
    setMessages((m) => [...m, { role: "user", text: clean }]);
    setInputValue("");
    setQuickReplies(null);
    setShowHandoff(false);
    setTyping(true);
    if (aiAvailable) {
      void sendAi(clean, history).catch(() => pushReply(respond(clean)));
    } else {
      setTimeout(() => pushReply(respond(clean)), 420);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      checkAiStatus();
      if (!greeted) {
        setGreeted(true);
        setTimeout(() => pushReply(GREETING), 250);
        setTimeout(() => inputRef.current?.focus(), 400);
      }
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={`Chat with ${ASSISTANT_NAME}`}
        className={`fixed right-5 bottom-5 z-200 flex h-[58px] w-[58px] items-center justify-center rounded-full transition-all duration-200 [transition-timing-function:var(--ease-jdl)] max-[480px]:right-3.5 max-[480px]:bottom-3.5 ${
          open
            ? "bg-navy-950 text-paper shadow-[var(--shadow-md-soft)]"
            : "text-navy-950 shadow-[var(--shadow-gold)] hover:-translate-y-0.5"
        }`}
        style={
          open
            ? undefined
            : { background: "linear-gradient(135deg, var(--gold-300), var(--gold-600))" }
        }
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`absolute h-6 w-6 transition-all duration-150 ${open ? "scale-60 -rotate-45 opacity-0" : "rotate-0 scale-100 opacity-100"}`}
        >
          <path d="M4 5h16v11H8l-4 4V5Z" />
          <path d="M8 9h8M8 12h5" />
        </svg>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`absolute h-6 w-6 transition-all duration-150 ${open ? "rotate-0 scale-100 opacity-100" : "scale-60 rotate-45 opacity-0"}`}
        >
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>

      <div
        role="dialog"
        aria-label={`Chat with ${ASSISTANT_NAME}`}
        aria-hidden={!open}
        data-open={open}
        className={`fixed right-5 bottom-[90px] z-199 flex flex-col overflow-hidden rounded-[var(--radius)] border bg-white shadow-[var(--shadow-md-soft)] transition-all duration-200 [transition-timing-function:var(--ease-jdl)] w-[min(380px,calc(100vw-40px))] h-[min(560px,calc(100vh-140px))] max-[480px]:right-3 max-[480px]:left-3 max-[480px]:w-auto max-[480px]:bottom-20 max-[480px]:h-[min(70vh,560px)] ${
          open ? "pointer-events-auto translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-4 scale-[0.98] opacity-0"
        }`}
        style={{ borderColor: "var(--border)" }}
      >
        <header className="flex shrink-0 items-center gap-3 bg-navy-950 px-4 py-3.5 text-paper">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-[0.85rem] font-bold text-navy-950"
            style={{ background: "linear-gradient(135deg, var(--gold-300), var(--gold-600))" }}
          >
            JC
          </span>
          <div className="min-w-0 flex-1">
            <p className="m-0 font-display text-[0.95rem] font-bold">{ASSISTANT_NAME}</p>
            <p className="m-0 mt-0.5 flex items-center gap-1.5 text-[0.74rem] text-[rgba(248,247,243,0.65)]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#34c37a]" />
              {aiAvailable === null
                ? "Checking availability…"
                : aiAvailable
                  ? "AI assistant — online"
                  : "Sample assistant — demo only"}
            </p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" className="shrink-0 text-[rgba(248,247,243,0.75)] hover:text-paper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4.5 w-4.5">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div ref={logRef} role="log" className="flex flex-1 flex-col gap-2.5 overflow-y-auto bg-paper p-4">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="max-w-[84%] self-end rounded-2xl rounded-br-sm bg-navy-950 px-3.5 py-2 text-[0.87rem] leading-relaxed whitespace-pre-line text-paper">
                {m.text}
              </div>
            ) : (
              <div key={i} className="max-w-[84%] self-start rounded-2xl rounded-bl-sm border bg-white px-3.5 py-2 text-[0.87rem] leading-relaxed whitespace-pre-line" style={{ borderColor: "var(--border)" }}>
                {m.text}
              </div>
            )
          )}

          {typing && (
            <div className="flex items-center gap-1 self-start rounded-2xl rounded-bl-sm border bg-white px-3.5 py-3" style={{ borderColor: "var(--border)" }}>
              {[0, 0.15, 0.3].map((delay) => (
                <span key={delay} className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint motion-reduce:animate-none" style={{ animationDelay: `${delay}s` }} />
              ))}
            </div>
          )}

          {showHandoff && <HandoffPanel phoneHref={phoneHref} />}

          {quickReplies && !showHandoff && (
            <div className="flex flex-wrap gap-2 self-stretch">
              {quickReplies.map((qr) =>
                typeof qr === "object" ? (
                  <Link key={qr.href + qr.label} href={qr.href} onClick={() => setOpen(false)} className="rounded-full border-[1.5px] border-gold-500 bg-white px-4 py-[0.5em] text-[0.78rem] font-semibold text-navy-800 transition-colors hover:bg-gold-500 hover:text-navy-950">
                    {qr.label}
                  </Link>
                ) : (
                  <button key={qr} type="button" onClick={() => send(qr)} className="rounded-full border-[1.5px] border-gold-500 bg-white px-4 py-[0.5em] text-[0.78rem] font-semibold text-navy-800 transition-colors hover:bg-gold-500 hover:text-navy-950">
                    {qr}
                  </button>
                )
              )}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(inputValue);
          }}
          className="flex shrink-0 gap-2 border-t bg-white p-3"
          style={{ borderColor: "var(--border)" }}
        >
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask something…"
            aria-label="Your message"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-full border-[1.5px] bg-paper px-4 py-2.5 text-[0.87rem] focus:border-gold-600 focus:outline-none"
            style={{ borderColor: "var(--border)" }}
          />
          <button type="submit" aria-label="Send message" className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-navy-950 text-paper transition-colors hover:bg-navy-800">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4">
              <path d="m3 11 18-8-8 18-2-8-8-2Z" />
            </svg>
          </button>
        </form>
        <p className="shrink-0 bg-white pb-2.5 text-center text-[0.68rem] text-ink-faint">
          Powered by{" "}
          <a href="https://princecaleb.dev" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-gold-600">
            princecaleb.dev
          </a>
        </p>
      </div>
    </>
  );
}
