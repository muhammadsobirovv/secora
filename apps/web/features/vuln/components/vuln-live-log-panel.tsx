"use client";

import * as React from "react";
import { Check, ChevronsDown, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/features/i18n/i18n-context";
import { useVulnScanJobLogs } from "../hooks/use-vuln";

const LEVEL_COLOR: Record<string, string> = {
  DEBUG: "text-zinc-500",
  INFO: "text-zinc-200",
  WARN: "text-amber-300",
  ERROR: "text-red-400",
};

function clock(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour12: false });
}

/// Terminal view of a scan. The log stream replays every stored line from the
/// start and closes itself once the job is finished, so the same view works
/// while the scan runs and after it is done.
export function VulnLiveLogPanel({ jobId, running }: { jobId: string; running: boolean }) {
  const { t } = useI18n();
  const { logs, connected, error } = useVulnScanJobLogs(jobId, true);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [follow, setFollow] = React.useState(true);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!follow) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [logs, follow]);

  function handleScroll(): void {
    const el = scrollRef.current;
    if (!el) return;
    // Scrolling up pauses auto-follow; scrolling back to the bottom resumes it.
    setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
  }

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(logs.map((log) => `[${log.level}] ${log.message}`).join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked by the browser; the text stays selectable.
    }
  }

  const live = running && connected;

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-200 shadow-inner">
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-3 py-2">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-red-500/80" />
            <span className="size-2.5 rounded-full bg-amber-400/80" />
            <span className="size-2.5 rounded-full bg-emerald-500/80" />
          </div>
          <span className="font-mono text-xs text-zinc-400">{t("vuln.terminal.title")}</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className={cn("flex items-center gap-1.5", live ? "text-emerald-400" : "text-zinc-500")}>
            <span className={cn("size-1.5 rounded-full", live ? "animate-pulse bg-emerald-400" : "bg-zinc-600")} />
            {running ? (connected ? t("recon.log.streaming") : t("recon.log.connecting")) : t("vuln.terminal.finished")}
          </span>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="flex items-center gap-1 text-zinc-400 transition-colors hover:text-zinc-100"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? t("vuln.terminal.copied") : t("vuln.terminal.copy")}
          </button>
        </div>
      </div>

      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="max-h-96 min-h-40 overflow-y-auto px-3 py-2 font-mono text-xs leading-relaxed"
        >
          {error && <p className="text-red-400">{error}</p>}
          {logs.length === 0 && !error && (
            <p className="text-zinc-500">{running ? t("recon.log.waiting") : t("vuln.terminal.empty")}</p>
          )}
          {logs.map((log) => (
            <div key={log.id} className={cn("flex gap-2 whitespace-pre-wrap break-all", LEVEL_COLOR[log.level])}>
              <span className="shrink-0 select-none text-zinc-600">{clock(log.createdAt)}</span>
              <span>{log.message}</span>
            </div>
          ))}
          {running && (
            <div className="mt-1 flex items-center gap-2 text-emerald-400">
              <span className="select-none">$</span>
              <span className="inline-block h-3.5 w-1.5 animate-pulse bg-emerald-400" aria-hidden="true" />
            </div>
          )}
        </div>
        {!follow && (
          <button
            type="button"
            onClick={() => setFollow(true)}
            className="absolute right-3 bottom-3 flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900/90 px-2.5 py-1 text-xs text-zinc-200 shadow hover:bg-zinc-800"
          >
            <ChevronsDown className="size-3.5" />
            {t("vuln.terminal.follow")}
          </button>
        )}
      </div>
    </div>
  );
}
