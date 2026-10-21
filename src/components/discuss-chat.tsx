"use client";

import { useEffect, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import { discussScope } from "@/lib/discuss-scopes";
import { api } from "./api";

type Turn = { role: "user" | "assistant"; content: string };

const QUICK_PROMPTS = ["Summarize this information.", "Suggest Action Steps", "Suggest Questions."];

export function DiscussChat({
  storeId,
  storeName,
  scope,
  from,
  to,
  periodLabel,
  onClose,
}: {
  storeId: string;
  storeName: string;
  scope: string;
  from: string;
  to: string;
  periodLabel: string;
  onClose: () => void;
}) {
  const meta = discussScope(scope);
  const label = meta?.label ?? "this view";
  const kind = meta?.kind === "chart" ? "this chart" : "this section";
  const [messages, setMessages] = useState<Turn[]>([
    {
      role: "assistant",
      content: `Hi there, I'm ready to discuss ${label} with you. How can I help you dive in today?`,
    },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"idle" | "all" | number>("idle");
  const scroller = useRef<HTMLDivElement>(null);
  const asked = messages.some((message) => message.role === "user");

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, busy]);

  async function send(text: string) {
    const history = [...messages, { role: "user" as const, content: text }];
    setMessages(history);
    setDraft("");
    setBusy(true);
    setError("");
    try {
      const result = await api<{ reply: string }>("/api/discuss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          scope,
          from: from || undefined,
          to: to || undefined,
          messages: history,
        }),
      });
      setMessages([...history, { role: "assistant", content: result.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not get a reply.");
    } finally {
      setBusy(false);
    }
  }

  function transcript() {
    const title = meta ? `${meta.kind === "chart" ? "Chart" : "Section"} · ${meta.label}` : scope;
    const lines = [`${storeName} · Discuss with AI`, title, `Period: ${periodLabel}`, ""];
    for (const message of messages) {
      lines.push(message.role === "user" ? "You" : "AI", message.content, "");
    }
    return lines.join("\n").trim();
  }

  async function copy(text: string, mark: "all" | number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(mark);
      window.setTimeout(() => setCopied("idle"), 1600);
    } catch {
      setCopied("idle");
    }
  }

  function exportPdf() {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const margin = 48;
    const width = doc.internal.pageSize.getWidth() - margin * 2;
    let y = margin;
    const plain = transcript().replace(/\*\*/g, "");
    for (const line of doc.splitTextToSize(plain, width) as string[]) {
      if (y > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text(line || " ", margin, y);
      y += 15;
    }
    const slug = (meta?.label ?? "discussion").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    doc.save(`${storeName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${slug}-discussion.pdf`);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-navy/30" role="presentation" onClick={onClose}>
      <section
        role="dialog"
        aria-label={`Discuss ${label} with AI`}
        className="flex h-full w-full max-w-md flex-col bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="border-b border-line px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue">
                {meta?.kind === "chart" ? "Chart discussion" : "Section discussion"}
              </p>
              <h2 className="mt-1 text-lg font-semibold">{label}</h2>
              <p className="mt-1 text-sm font-medium text-ink">{periodLabel}</p>
              <p className="mt-1 text-sm text-muted">Focused on {kind}. Replies stay short and use the figures in view.</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-md border border-line px-2 py-1 text-sm">
              Close
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => copy(transcript(), "all")} className="rounded-md border border-line px-3 py-1.5 text-sm font-semibold">
              {copied === "all" ? "Copied" : "Copy chat"}
            </button>
            <button type="button" onClick={exportPdf} className="rounded-md bg-blue px-3 py-1.5 text-sm font-semibold text-white">
              Export PDF
            </button>
          </div>
        </header>

        <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((message, index) => (
            <article key={`${message.role}-${index}`} className={`rounded-lg px-3 py-2 text-sm leading-6 ${message.role === "user" ? "ml-8 bg-ice" : "mr-4 border border-line bg-white"}`}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{message.role === "user" ? "You" : "AI"}</p>
                {message.role === "assistant" ? (
                  <button type="button" className="text-xs font-semibold text-blue" onClick={() => copy(message.content, index)}>
                    {copied === index ? "Copied" : "Copy"}
                  </button>
                ) : null}
              </div>
              {message.role === "assistant" ? <ChatMarkdown text={message.content} /> : <p className="whitespace-pre-wrap">{message.content}</p>}
            </article>
          ))}
          {!asked && !busy ? (
            <div className="flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((prompt) => (
                <button key={prompt} type="button" onClick={() => void send(prompt)} className="rounded-full border border-line bg-white px-3 py-1.5 text-left text-sm font-medium text-blue">
                  {prompt}
                </button>
              ))}
            </div>
          ) : null}
          {busy ? (
            <div className="flex items-center gap-2 text-sm text-muted" role="status">
              <span className="analyzer-spinner-sm" aria-hidden />
              Thinking through the figures…
            </div>
          ) : null}
          {error ? <p className="rounded-md border border-bad/20 px-3 py-2 text-sm text-bad">{error}</p> : null}
        </div>

        <form
          className="border-t border-line p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const text = draft.trim();
            if (!text || busy) return;
            void send(text);
          }}
        >
          <label className="sr-only" htmlFor="discuss-question">
            Follow-up question
          </label>
          <textarea
            id="discuss-question"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                const text = draft.trim();
                if (!text || busy) return;
                void send(text);
              }
            }}
            rows={3}
            placeholder={`Ask a follow-up about ${label}`}
            className="w-full rounded-md border border-line px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-muted">Enter to send. Shift+Enter for a new line.</p>
          <button type="submit" disabled={busy || !draft.trim()} className="mt-2 rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            Send
          </button>
        </form>
      </section>
    </div>
  );
}

function ChatMarkdown({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((block, index) => {
        const lines = block.split("\n").filter((line) => line.trim().length > 0);
        if (lines.length && lines.every((line) => /^\s*[-*]\s+/.test(line))) {
          return (
            <ul key={index} className="list-disc space-y-1 pl-4">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>
                  <Inline text={line.replace(/^\s*[-*]\s+/, "")} />
                </li>
              ))}
            </ul>
          );
        }
        if (lines.length && lines.every((line) => /^\s*\d+[.)]\s+/.test(line))) {
          return (
            <ol key={index} className="list-decimal space-y-1 pl-4">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>
                  <Inline text={line.replace(/^\s*\d+[.)]\s+/, "")} />
                </li>
              ))}
            </ol>
          );
        }
        return (
          <p key={index}>
            {lines.map((line, lineIndex) => (
              <span key={`${line}-${lineIndex}`}>
                {lineIndex > 0 ? <br /> : null}
                <Inline text={line} />
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={index}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return <code key={index}>{part.slice(1, -1)}</code>;
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}
