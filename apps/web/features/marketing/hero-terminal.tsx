"use client";

import * as React from "react";
import { useI18n, type MessageKey } from "@/features/i18n/i18n-context";
import { usePrefersReducedMotion } from "@/lib/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";
import { AttackPathGraph } from "./attack-path-graph";

type Tone = "command" | "ok" | "critical" | "high" | "ai" | "muted";

interface TerminalLine {
  /// Short fixed-width gutter tag ("$", "✓", a severity label).
  tag: string | MessageKey;
  tagIsKey?: boolean;
  /// A message key, or a literal for CLI syntax that is identical in every
  /// language (the command itself).
  text: string | MessageKey;
  textIsKey?: boolean;
  tone: Tone;
}

const LINES: TerminalLine[] = [
  { tag: "$", text: "secora scan example.com", tone: "command" },
  { tag: "✓", text: "landing.terminal.subdomains", textIsKey: true, tone: "ok" },
  { tag: "✓", text: "landing.terminal.ports", textIsKey: true, tone: "ok" },
  { tag: "landing.severity.critical", tagIsKey: true, text: "landing.terminal.sqli", textIsKey: true, tone: "critical" },
  { tag: "landing.severity.high", tagIsKey: true, text: "landing.terminal.jwt", textIsKey: true, tone: "high" },
  { tag: "landing.severity.ai", tagIsKey: true, text: "landing.terminal.chain", textIsKey: true, tone: "ai" },
  { tag: "—", text: "landing.terminal.done", textIsKey: true, tone: "muted" },
];

const TAG_TONE: Record<Tone, string> = {
  command: "text-primary",
  ok: "text-sev-ok",
  critical: "text-sev-critical",
  high: "text-sev-high",
  ai: "text-sev-ok",
  muted: "text-muted-foreground",
};

const TEXT_TONE: Record<Tone, string> = {
  command: "text-foreground",
  ok: "text-muted-foreground",
  critical: "text-foreground",
  high: "text-foreground",
  ai: "text-sev-ok",
  muted: "text-muted-foreground",
};

const CHAR_MS = 22;
const LINE_PAUSE_MS = 260;

/// The landing hero's product shot: a scan typing itself out above the
/// attack path it produced. Always rendered in the dark Signal palette
/// (the `dark` class re-scopes every theme token for this subtree) since
/// it depicts a terminal. Server render and reduced-motion show the full
/// output immediately; the not-yet-typed remainder of each line is kept in
/// the layout (invisible) so typing never shifts the page.
export function HeroTerminal() {
  const { t } = useI18n();
  const reducedMotion = usePrefersReducedMotion();
  const lines = LINES.map((line) => ({
    ...line,
    tag: line.tagIsKey ? t(line.tag as MessageKey) : line.tag,
    text: line.textIsKey ? t(line.text as MessageKey) : line.text,
  }));
  const totalChars = lines.reduce((sum, line) => sum + line.text.length, 0);

  const [typed, setTyped] = React.useState(totalChars);

  React.useEffect(() => {
    if (reducedMotion) {
      setTyped(Number.MAX_SAFE_INTEGER);
      return;
    }
    setTyped(0);
    let count = 0;
    let lineIndex = 0;
    let lineEnd = lines[0]?.text.length ?? 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      count += 1;
      setTyped(count);
      if (count >= totalChars) return;
      let delay = CHAR_MS;
      if (count === lineEnd) {
        lineIndex += 1;
        lineEnd += lines[lineIndex]?.text.length ?? 0;
        delay = LINE_PAUSE_MS;
      }
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, 500);
    return () => clearTimeout(timer);
    // Re-run when the language changes (line lengths change) or motion
    // preference flips — not on every render's fresh `lines` array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, totalChars]);

  let remaining = typed;
  const done = typed >= totalChars;

  return (
    <figure
      className="dark overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl shadow-primary/10"
      aria-label={t("landing.terminal.label")}
    >
      <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5" aria-hidden="true">
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="ml-3 font-mono text-xs text-muted-foreground">secora — scan</span>
      </div>

      <div className="space-y-1.5 px-4 py-4 font-mono text-[13px] leading-relaxed" aria-hidden="true">
        {lines.map((line, i) => {
          const visibleCount = Math.max(0, Math.min(line.text.length, remaining));
          const started = remaining > 0 || i === 0;
          remaining -= line.text.length;
          const isCurrent = !done && visibleCount < line.text.length && started;
          return (
            <div key={i} className={cn("flex gap-3", !started && "invisible")}>
              <span className={cn("w-[4.5rem] shrink-0 truncate text-xs leading-relaxed font-semibold uppercase", TAG_TONE[line.tone])}>
                {line.tag}
              </span>
              <span className={cn("min-w-0", TEXT_TONE[line.tone])}>
                {line.text.slice(0, visibleCount)}
                {isCurrent && <span className="signal-caret text-primary">▍</span>}
                <span className="invisible">{line.text.slice(visibleCount)}</span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border px-4 pt-3 pb-4">
        <AttackPathGraph />
      </div>
    </figure>
  );
}
