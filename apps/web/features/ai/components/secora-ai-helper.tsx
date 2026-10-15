"use client";

import * as React from "react";
import { Bot, KeyRound, Send, Square, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiAccessDialog } from "./ai-access-dialog";
import {
  AssistantStreamError,
  streamAssistantReply,
  type AssistantTurn,
} from "@/features/ai/lib/assistant-stream";

const LIMIT_CODE = "AI_FREE_TIER_LIMIT_REACHED";

/// Floating "Secora AI" helper (bottom-right of every dashboard page).
/// Stateless: conversation lives in component state only.
export function SecoraAiHelper() {
  const [open, setOpen] = React.useState(false);
  const [accessOpen, setAccessOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<AssistantTurn[]>([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<{ text: string; limit: boolean } | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, open]);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const next: AssistantTurn[] = [...messages, { role: "user", content: text }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setError(null);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamAssistantReply(
        next,
        (delta) =>
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.role === "assistant") {
              copy[copy.length - 1] = { ...last, content: last.content + delta };
            }
            return copy;
          }),
        controller.signal,
      );
    } catch (e) {
      if (!controller.signal.aborted) {
        const code = e instanceof AssistantStreamError ? e.code : undefined;
        setError({
          text: e instanceof Error ? e.message : "So'rov bajarilmadi.",
          limit: code === LIMIT_CODE,
        });
      }
    } finally {
      // Drop an empty assistant placeholder left by a failed/aborted request.
      setMessages((prev) =>
        prev.length > 0 && prev[prev.length - 1]?.content === "" ? prev.slice(0, -1) : prev,
      );
      setBusy(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function clear() {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-4 z-50 flex h-[32rem] max-h-[calc(100svh-7rem)] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border bg-background shadow-xl">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Bot className="size-4 text-primary" /> Secora AI
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="size-7" title="AI rejimi" onClick={() => setAccessOpen(true)}>
                <KeyRound className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="size-7" title="Tozalash" onClick={clear}>
                <Trash2 className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="size-7" title="Yopish" onClick={() => setOpen(false)}>
                <X className="size-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-3 text-sm">
            {messages.length === 0 && (
              <p className="text-muted-foreground">
                Salom! Men Secora AI. Platforma bo&apos;yicha savol bering: recon, skanerlar,
                loyihalar, hisobotlar…
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 " +
                    (m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted")
                  }
                >
                  {m.content || "…"}
                </div>
              </div>
            ))}
            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs">
                <p>{error.text}</p>
                {error.limit && (
                  <Button size="sm" className="mt-2" onClick={() => setAccessOpen(true)}>
                    AI rejimini tanlash
                  </Button>
                )}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            className="flex items-center gap-2 border-t p-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Savol yozing…"
              className="h-9 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              maxLength={4000}
            />
            {busy ? (
              <Button type="button" size="icon" variant="outline" onClick={stop} title="To'xtatish">
                <Square className="size-4" />
              </Button>
            ) : (
              <Button type="submit" size="icon" disabled={!input.trim()} title="Yuborish">
                <Send className="size-4" />
              </Button>
            )}
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Secora AI"
        className="fixed bottom-4 right-4 z-50 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
      >
        {open ? <X className="size-5" /> : <Bot className="size-5" />}
      </button>

      <AiAccessDialog open={accessOpen} onOpenChange={setAccessOpen} />
    </>
  );
}
