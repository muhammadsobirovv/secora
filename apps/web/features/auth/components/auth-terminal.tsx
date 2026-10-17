"use client";

import * as React from "react";
import { usePrefersReducedMotion } from "@/lib/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

type Tone = "command" | "ok" | "muted" | "ai";

interface BootLine {
  tone: Tone;
  text: string;
}

/// CLI-style boot output for the "secure session" panel beside the sign-in
/// form. Literal terminal text (identical in every language, like the
/// landing hero's command line), so it is not routed through i18n.
const BOOT: BootLine[] = [
  { tone: "command", text: "secora session init" },
  { tone: "ok", text: "✓ TLS 1.3 · HSTS · certificate verified" },
  { tone: "ok", text: "✓ scope-guard armed (out-of-scope = blocked)" },
  { tone: "ok", text: "✓ key vault sealed · AES-256-GCM" },
  { tone: "muted", text: "  4 stages ready: scope → discover → test → report" },
  { tone: "ai", text: "✦ Secora AI standing by (uz · ru · en)" },
  { tone: "command", text: "secora auth --wait" },
];

const LINE_MS = 420;

const TONE: Record<Tone, string> = {
  command: "text-foreground before:mr-2 before:text-primary before:content-['$']",
  ok: "text-sev-ok",
  muted: "text-muted-foreground",
  ai: "text-sev-ok",
};

/// Decorative "secure session" terminal for the auth pages. Always rendered
/// in the dark palette (the `dark` class re-scopes the theme tokens for this
/// subtree). While the user types in the email field, an `identity:` line
/// echoes it — wired through a delegated document listener so the form
/// components stay untouched. Hidden from assistive tech: it carries no
/// information the form does not.
export function AuthTerminal() {
  const reducedMotion = usePrefersReducedMotion();
  const [visible, setVisible] = React.useState(BOOT.length);
  const [identity, setIdentity] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (reducedMotion) {
      setVisible(BOOT.length);
      return;
    }
    setVisible(0);
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      setVisible(count);
      if (count >= BOOT.length) clearInterval(timer);
    }, LINE_MS);
    return () => clearInterval(timer);
  }, [reducedMotion]);

  React.useEffect(() => {
    function onInput(event: Event) {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.id === "email") {
        setIdentity(target.value);
      }
    }
    document.addEventListener("input", onInput);
    return () => document.removeEventListener("input", onInput);
  }, []);

  const booted = visible >= BOOT.length;

  return (
    <div
      aria-hidden="true"
      className="dark relative flex h-full min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-2xl shadow-primary/10"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_40%_at_70%_0%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent)]" />
      <div className="relative flex items-center gap-1.5 border-b border-border bg-card px-4 py-3">
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="ml-3 font-mono text-xs text-muted-foreground">{"secora://secure-session"}</span>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-xs text-sev-ok">
          <span className="size-1.5 rounded-full bg-sev-ok" />
          {booted ? "awaiting identity" : "handshake"}
        </span>
      </div>

      <div className="relative flex-1 space-y-1 p-5 font-mono text-[13px] leading-8">
        {BOOT.slice(0, visible).map((line, i) => (
          <div key={i} className={cn("whitespace-pre-wrap", TONE[line.tone])}>
            {line.text}
          </div>
        ))}
        {identity !== null && (
          <div className="text-foreground">{`identity: ${identity || "…"}`}</div>
        )}
        {booted && <span className="signal-caret text-primary">▍</span>}
      </div>

      <div className="relative flex flex-wrap gap-2 border-t border-border bg-card px-4 py-3 font-mono text-[11px] text-muted-foreground">
        {["TLS 1.3", "AES-256-GCM", "scope-guard"].map((label) => (
          <span key={label} className="rounded-full border border-border px-2 py-0.5">
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
