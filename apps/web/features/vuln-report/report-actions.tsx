"use client";

import * as React from "react";
import { Check, Copy, Download, FileText, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import type { ReportLanguage, ShareLinkDto } from "@pentesthub/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/features/i18n/i18n-context";
import {
  createReportShare,
  downloadReport,
  listReportShares,
  revokeReportShare,
  type ReportExportFormat,
} from "@/lib/api/vuln-report";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/// Open the printable report, or download it as PDF / JSON. The files are
/// fetched with the user's token and handed to the browser as blobs, so the
/// token never appears in a URL.
export function ReportExportButtons({ jobId, language }: { jobId: string; language: ReportLanguage }) {
  const { t } = useI18n();
  const [busy, setBusy] = React.useState<ReportExportFormat | null>(null);

  async function run(format: ReportExportFormat): Promise<void> {
    setBusy(format);
    try {
      const blob = await downloadReport(jobId, format, language);
      if (format === "html") {
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank", "noopener,noreferrer");
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        saveBlob(blob, `secora-report.${format}`);
      }
    } catch {
      toast.error(t("report.export.error"));
    } finally {
      setBusy(null);
    }
  }

  const buttons: { format: ReportExportFormat; icon: React.ReactNode; label: string }[] = [
    { format: "html", icon: <FileText className="size-4" aria-hidden="true" />, label: t("report.export.html") },
    { format: "pdf", icon: <Download className="size-4" aria-hidden="true" />, label: t("report.export.pdf") },
    { format: "json", icon: <Download className="size-4" aria-hidden="true" />, label: t("report.export.json") },
  ];

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-2">
        {buttons.map((button) => (
          <Button key={button.format} type="button" variant="outline" className="min-h-11" disabled={busy !== null} onClick={() => void run(button.format)}>
            {busy === button.format ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : button.icon}
            {button.label}
          </Button>
        ))}
      </div>
      {language !== "en" && <p className="text-xs text-muted-foreground">{t("report.export.pdfNote")}</p>}
    </div>
  );
}

const DAY_CHOICES: { days: number; labelKey: "report.share.day1" | "report.share.day7" | "report.share.day30" }[] = [
  { days: 1, labelKey: "report.share.day1" },
  { days: 7, labelKey: "report.share.day7" },
  { days: 30, labelKey: "report.share.day30" },
];

/// Create, copy and revoke read-only links to this report. A link always
/// expires (1, 7 or 30 days) and may have a password. The full link is shown
/// once, when it is created; the server keeps only its hash.
export function ShareReportDialog({ jobId }: { jobId: string }) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [links, setLinks] = React.useState<ShareLinkDto[]>([]);
  const [days, setDays] = React.useState(7);
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [created, setCreated] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const refresh = React.useCallback(async () => {
    try {
      setLinks(await listReportShares(jobId));
    } catch {
      toast.error(t("report.share.error"));
    }
  }, [jobId, t]);

  React.useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  async function handleCreate(): Promise<void> {
    setBusy(true);
    try {
      const link = await createReportShare(jobId, days, password.trim() || undefined);
      setCreated(`${window.location.origin}/shared/${link.token}`);
      setPassword("");
      await refresh();
    } catch {
      toast.error(t("report.share.error"));
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy(): Promise<void> {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("report.share.error"));
    }
  }

  async function handleRevoke(id: string): Promise<void> {
    try {
      await revokeReportShare(id);
      await refresh();
    } catch {
      toast.error(t("report.share.error"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="min-h-11">
          <Share2 className="size-4" aria-hidden="true" /> {t("report.share")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("report.share.title")}</DialogTitle>
          <DialogDescription>{t("report.share.intro")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div role="group" aria-label={t("report.share.days")} className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{t("report.share.days")}</span>
            {DAY_CHOICES.map((choice) => (
              <button
                key={choice.days}
                type="button"
                aria-pressed={days === choice.days}
                onClick={() => setDays(choice.days)}
                className={cn(
                  "min-h-11 rounded-full border px-3 text-sm transition-colors",
                  days === choice.days ? "border-primary bg-primary/10 font-medium" : "border-border text-muted-foreground",
                )}
              >
                {t(choice.labelKey)}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="share-password">{t("report.share.password")}</Label>
            <Input id="share-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-11" />
          </div>

          <Button type="button" className="min-h-11" disabled={busy} onClick={() => void handleCreate()}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Share2 className="size-4" aria-hidden="true" />}
            {busy ? t("report.share.creating") : t("report.share.create")}
          </Button>

          {created && (
            <div className="flex flex-col gap-1.5 rounded-md border border-border bg-muted p-3">
              <p className="text-xs text-muted-foreground">{t("report.share.created")}</p>
              <p className="text-sm break-all">{created}</p>
              <Button type="button" variant="outline" className="min-h-11 self-start" onClick={() => void handleCopy()}>
                {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                {copied ? t("report.share.copied") : t("report.share.copy")}
              </Button>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold">{t("report.share.existing")}</h3>
            {links.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">{t("report.share.none")}</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-2">
                {links.map((link) => (
                  <li key={link.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-xs">{link.token.slice(0, 12)}…</span>
                      <span className="block text-xs text-muted-foreground">
                        {link.revokedAt
                          ? t("report.share.revoked")
                          : link.expiresAt
                            ? t("report.share.expires", { date: formatDateTime(link.expiresAt) })
                            : ""}
                        {" · "}
                        {t("report.share.opened", { count: String(link.accessCount) })}
                      </span>
                    </span>
                    {!link.revokedAt && (
                      <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => void handleRevoke(link.id)}>
                        {t("report.share.revoke")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
