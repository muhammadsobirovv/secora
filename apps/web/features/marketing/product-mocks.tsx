"use client";

import { Bot, FileText } from "lucide-react";
import { useI18n } from "@/features/i18n/i18n-context";
import { cn } from "@/lib/utils";

/// Miniature product "screenshots" for the landing feature rows, built
/// from the same tokens/components as the real app rather than images —
/// they stay sharp, theme-aware and translated. Decorative: each sits next
/// to a heading and paragraph that carry the actual content.

function MockFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("rounded-xl border border-border bg-card p-4 shadow-xl shadow-primary/5", className)}
    >
      <div className="mb-3 flex gap-1.5">
        <span className="size-2 rounded-full bg-border" />
        <span className="size-2 rounded-full bg-border" />
        <span className="size-2 rounded-full bg-border" />
      </div>
      {children}
    </div>
  );
}

const RECON_ROWS = [
  { host: "api.example.com", status: 200, tech: "nginx · Go" },
  { host: "app.example.com", status: 200, tech: "Next.js" },
  { host: "admin.example.com", status: 403, tech: "nginx" },
  { host: "dev.example.com", status: 301, tech: "Apache" },
];

export function ReconMock() {
  const { t } = useI18n();
  return (
    <MockFrame>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-border pb-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        <span>{t("landing.mock.host")}</span>
        <span>{t("landing.mock.status")}</span>
        <span className="w-20">{t("landing.mock.tech")}</span>
      </div>
      {RECON_ROWS.map((row) => (
        <div
          key={row.host}
          className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-b border-border/60 py-2 text-sm last:border-0"
        >
          <span className="truncate font-mono text-[13px]">{row.host}</span>
          <span
            className={cn(
              "font-mono text-[13px] tabular-nums",
              row.status === 200 ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {row.status}
          </span>
          <span className="w-20 truncate text-xs text-muted-foreground">{row.tech}</span>
        </div>
      ))}
    </MockFrame>
  );
}

const VULN_BARS = [
  { key: "landing.severity.critical", count: 3, bar: "bg-sev-critical" },
  { key: "landing.severity.high", count: 8, bar: "bg-sev-high" },
  { key: "landing.severity.medium", count: 14, bar: "bg-muted-foreground/50" },
  { key: "landing.severity.low", count: 21, bar: "bg-border" },
] as const;

export function VulnMock() {
  const { t } = useI18n();
  const max = Math.max(...VULN_BARS.map((b) => b.count));
  return (
    <MockFrame>
      <p className="mb-3 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {t("landing.mock.findings")}
      </p>
      <div className="space-y-2.5">
        {VULN_BARS.map((b) => (
          <div key={b.key} className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-3 text-sm">
            <span className="truncate text-muted-foreground">{t(b.key)}</span>
            <span className="h-2 overflow-hidden rounded-full bg-muted">
              <span className={cn("block h-full rounded-full", b.bar)} style={{ width: `${(b.count / max) * 100}%` }} />
            </span>
            <span className="text-right font-mono tabular-nums">{b.count}</span>
          </div>
        ))}
      </div>
    </MockFrame>
  );
}

export function AiMock() {
  const { t } = useI18n();
  return (
    <MockFrame className="space-y-3">
      <div className="ml-auto max-w-[85%] rounded-lg rounded-br-sm bg-primary/15 px-3 py-2 text-sm">
        {t("landing.mock.aiQuestion")}
      </div>
      <div className="flex max-w-[92%] gap-2.5">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border border-sev-ok/40 text-sev-ok">
          <Bot className="size-3.5" />
        </span>
        <div className="space-y-2">
          <p className="rounded-lg rounded-tl-sm border border-border px-3 py-2 text-sm text-muted-foreground">
            {t("landing.mock.aiAnswer")}
          </p>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-sev-ok/40 px-2 py-0.5 text-xs text-sev-ok">
            <FileText className="size-3" />
            {t("landing.mock.aiDraft")}
          </span>
        </div>
      </div>
    </MockFrame>
  );
}
