"use client";

import * as React from "react";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import type { FindingExplanationDto, ReportFindingDto } from "@pentesthub/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VulnFindingSeverityBadge } from "@/features/vuln/components/vuln-finding-severity-badge";
import { useI18n } from "@/features/i18n/i18n-context";
import { cn } from "@/lib/utils";

const CONFIDENCE_CLASS: Record<ReportFindingDto["confidence"], string> = {
  CONFIRMED: "border-success/40 bg-success/10 text-success",
  LIKELY: "border-warning/40 bg-warning/10 text-warning-foreground dark:text-warning",
  INFO: "border-border text-muted-foreground",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h4>
      <div className="mt-1 text-sm break-words whitespace-pre-wrap">{children}</div>
    </div>
  );
}

/// One finding of the report. Collapsed it is a 44 px-tall row (severity,
/// confidence, title, where); opened it shows what it is, why it matters, how to
/// fix it (with a snippet for the detected stack), the re-check result, the
/// redacted evidence and the references. Everything is plain text: nothing from
/// the scan is ever rendered as HTML.
export function ReportFindingCard({
  finding,
  explain,
}: {
  finding: ReportFindingDto;
  /// Present on the signed-in page only; the shared page has no AI call.
  explain?: (findingId: string) => Promise<FindingExplanationDto>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [explanation, setExplanation] = React.useState<FindingExplanationDto | null>(null);

  const text = explanation ?? finding.builtIn;
  const snippet = explanation?.snippet ?? finding.snippet;
  const evidence = [
    [t("report.request"), finding.evidence.request],
    [t("report.response"), finding.evidence.response],
    [t("report.payload"), finding.evidence.payload],
  ].filter((pair): pair is [string, string] => Boolean(pair[1]));
  const ids = [finding.cwe, ...finding.cves].filter(Boolean).join(", ");

  async function handleExplain(): Promise<void> {
    if (!explain) return;
    setBusy(true);
    setFailed(false);
    try {
      setExplanation(await explain(finding.id));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-lg border border-border bg-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-start gap-2 p-3 text-left"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-1.5">
            <VulnFindingSeverityBadge severity={finding.severity} />
            <Badge variant="outline" className={cn(CONFIDENCE_CLASS[finding.confidence])}>
              {t(`report.confidence.${finding.confidence}` as const)}
            </Badge>
          </span>
          <span className="text-sm font-medium break-words">{finding.title}</span>
          <span className="text-xs break-all text-muted-foreground">{finding.affected}</span>
        </span>
        <ChevronDown
          className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-border p-3">
          <Section title={t("report.whatIsThis")}>{text.whatIsThis}</Section>
          <Section title={t("report.whyItMatters")}>{text.whyItMatters}</Section>
          <Section title={t("report.howToFix")}>{text.howToFix}</Section>

          {snippet && (
            <div>
              <p className="text-xs text-muted-foreground">
                {t("report.exampleFor", { stack: finding.stack ?? snippet.stack })}
              </p>
              <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-2.5 font-mono text-xs break-all whitespace-pre-wrap">
                {snippet.code}
              </pre>
            </div>
          )}

          {explain && (
            <div className="flex flex-col gap-1.5">
              {!explanation && (
                <Button type="button" variant="outline" size="sm" className="min-h-11 self-start" disabled={busy} onClick={() => void handleExplain()}>
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
                  {busy ? t("report.explaining") : t("report.explain")}
                </Button>
              )}
              {failed && (
                <p role="alert" className="text-xs text-destructive">
                  {t("report.explainError")}
                </p>
              )}
              {explanation && (
                <p className="text-xs text-muted-foreground">
                  {explanation.source === "AI" ? t("report.explained.ai") : t("report.explained.builtIn")}
                </p>
              )}
            </div>
          )}

          <p className="text-xs">
            <span className="font-medium">{t("report.verification")}:</span>{" "}
            {t(`report.verification.${finding.verification.status}` as const)}
            {finding.verification.detail ? ` - ${finding.verification.detail}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("report.reportedBy")}: {[...new Set(finding.sources.map((source) => source.tool))].join(", ")}
            {ids ? ` · ${ids}` : ""}
          </p>

          {evidence.length > 0 && (
            <details className="rounded-md border border-border">
              <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm">{t("report.evidence")}</summary>
              <div className="flex flex-col gap-2 p-3 pt-0">
                {evidence.map(([label, body]) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <pre className="mt-1 max-h-60 overflow-auto rounded-md bg-muted p-2.5 font-mono text-xs break-all whitespace-pre-wrap">
                      {body}
                    </pre>
                  </div>
                ))}
              </div>
            </details>
          )}

          {finding.references.length > 0 && (
            <Section title={t("report.references")}>
              <ul className="flex flex-col gap-1 text-xs">
                {finding.references
                  .filter((ref) => /^https?:\/\//i.test(ref))
                  .map((ref) => (
                    <li key={ref} className="break-all">
                      <a href={ref} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        {ref}
                      </a>
                    </li>
                  ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </article>
  );
}
