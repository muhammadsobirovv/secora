"use client";

import { useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, Copy, LifeBuoy, RefreshCw, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDiagnostics } from "@/features/system/hooks/use-diagnostics";

/// Module 15 — task #353 (Health & diagnostics). A self-service page a
/// user can run before contacting support (task #355 will link here from
/// wherever the support flow lands): one button produces a report that
/// covers everything a support agent would otherwise have to ask for by
/// hand — server reachability/latency, database health, version skew
/// between this browser tab and the deployed server, and basic client
/// environment. "Copy report" formats it as plain text so it can be
/// pasted straight into a support ticket or chat.
export default function DiagnosticsSettingsPage() {
  const { report, isRunning, error, run } = useDiagnostics();

  useEffect(() => {
    void run();
    // Only auto-run once on page load; the button re-runs on demand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function formatReportText(): string {
    if (!report) return "";
    return [
      `PentestHub AI diagnostics — ${report.generatedAt}`,
      `Round-trip latency: ${report.roundTripMs}ms`,
      `App version: ${report.appVersion}`,
      `Server version: ${report.serverVersion} (${report.versionsMatch ? "matches" : "MISMATCH — refresh your browser"})`,
      `Server status: ${report.server.status}`,
      `Server uptime: ${Math.round(report.server.uptimeSeconds)}s`,
      `Server environment: ${report.server.nodeEnv}`,
      `Database: ${report.server.databaseStatus}${report.server.databaseLatencyMs !== null ? ` (${report.server.databaseLatencyMs}ms)` : ""}`,
      `Browser: ${report.client.userAgent}`,
      `Platform: ${report.client.platform}`,
      `Language: ${report.client.language}`,
      `Time zone: ${report.client.timeZone}`,
      `Viewport: ${report.client.viewport}`,
      `Online: ${report.client.online ? "yes" : "no"}`,
    ].join("\n");
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(formatReportText());
      toast.success("Diagnostics report copied to clipboard");
    } catch {
      toast.error("Couldn't copy to clipboard.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base">Diagnostics</CardTitle>
            <CardDescription>
              Run a self-test before contacting support — checks server reachability, database
              health, and version sync.
            </CardDescription>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" onClick={() => void run()} disabled={isRunning}>
              <RefreshCw className={isRunning ? "size-3.5 animate-spin" : "size-3.5"} /> Run again
            </Button>
            <Button size="sm" onClick={() => void handleCopy()} disabled={!report}>
              <Copy className="size-3.5" /> Copy report
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <XCircle className="size-4 shrink-0" /> {error}
            </div>
          )}

          {isRunning && !report && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="size-3.5 animate-spin" /> Running diagnostics…
            </div>
          )}

          {report && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DiagnosticRow
                label="Server"
                ok={report.server.status === "ok"}
                detail={`${report.server.status} · uptime ${Math.round(report.server.uptimeSeconds)}s`}
              />
              <DiagnosticRow
                label="Round-trip latency"
                ok={report.roundTripMs < 1000}
                detail={`${report.roundTripMs}ms`}
              />
              <DiagnosticRow
                label="Database"
                ok={report.server.databaseStatus === "ok"}
                detail={
                  report.server.databaseLatencyMs !== null
                    ? `${report.server.databaseStatus} · ${report.server.databaseLatencyMs}ms`
                    : report.server.databaseStatus
                }
              />
              <DiagnosticRow
                label="Version sync"
                ok={report.versionsMatch}
                detail={
                  report.versionsMatch
                    ? `${report.appVersion}`
                    : `app ${report.appVersion} ≠ server ${report.serverVersion} — refresh`
                }
              />
              <DiagnosticRow label="Network" ok={report.client.online} detail={report.client.online ? "online" : "offline"} />
              <DiagnosticRow label="Browser" ok detail={`${report.client.platform} · ${report.client.language}`} />
            </div>
          )}

          {/* Module 15 — task #355. Support's "attach diagnostics" checkbox
              reuses this same useDiagnostics() hook directly, so this link
              is a shortcut, not the only path. */}
          <div className="flex items-center gap-2 border-t pt-4">
            <LifeBuoy className="size-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Still stuck?{" "}
              <Link href="/settings/support" className="font-medium text-foreground underline underline-offset-2">
                Contact support
              </Link>{" "}
              — this report can be attached automatically.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DiagnosticRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
      <div className="flex items-center gap-2">
        {ok ? (
          <CheckCircle2 className="size-4 text-emerald-500" />
        ) : (
          <XCircle className="size-4 text-destructive" />
        )}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <Badge variant={ok ? "success" : "destructive"} className="font-mono text-xs">
        {detail}
      </Badge>
    </div>
  );
}
