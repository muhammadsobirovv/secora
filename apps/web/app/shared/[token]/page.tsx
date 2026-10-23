"use client";

import * as React from "react";
import { use } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import type { VulnReportDto } from "@pentesthub/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/features/i18n/i18n-context";
import { ReportView } from "@/features/vuln-report/report-view";
import { ApiError } from "@/lib/api/client";
import { getSharedReport } from "@/lib/api/vuln-report";

type State =
  | { kind: "loading" }
  | { kind: "password"; wrong: boolean }
  | { kind: "error"; messageKey: "report.public.expired" | "report.public.invalid" | "report.loadError" }
  | { kind: "ready"; report: VulnReportDto };

/// A shared, read-only scan report. No login: the link's token is the
/// credential (plus a password when the owner set one). Expired and revoked
/// links are refused by the server and shown as such. The page makes no AI
/// call and has no action that changes anything.
export default function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { t, locale } = useI18n();
  const { token } = use(params);
  const [state, setState] = React.useState<State>({ kind: "loading" });
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(
    async (pw?: string) => {
      setBusy(true);
      try {
        const report = await getSharedReport(token, locale, pw);
        setState({ kind: "ready", report });
      } catch (error) {
        const code = error instanceof ApiError ? error.code : null;
        if (code === "SHARE_LINK_PASSWORD_REQUIRED") setState({ kind: "password", wrong: false });
        else if (code === "SHARE_LINK_PASSWORD_INCORRECT") setState({ kind: "password", wrong: true });
        else if (code === "SHARE_LINK_EXPIRED_OR_REVOKED") setState({ kind: "error", messageKey: "report.public.expired" });
        else if (code === "SHARE_LINK_NOT_FOUND") setState({ kind: "error", messageKey: "report.public.invalid" });
        else setState({ kind: "error", messageKey: "report.loadError" });
      } finally {
        setBusy(false);
      }
    },
    [token, locale],
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 px-4 py-4">
      <header className="flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="size-4" aria-hidden="true" /> {t("report.public.banner")}
      </header>
      <h1 className="text-xl font-semibold">{t("report.title")}</h1>

      {state.kind === "loading" && (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {state.kind === "password" && (
        <form
          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void load(password);
          }}
        >
          <p className="font-medium">{t("report.public.passwordTitle")}</p>
          <Label htmlFor="shared-password">{t("report.public.passwordLabel")}</Label>
          <Input
            id="shared-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-11"
            aria-invalid={state.wrong}
          />
          {state.wrong && (
            <p role="alert" className="text-sm text-destructive">
              {t("report.public.wrongPassword")}
            </p>
          )}
          <Button type="submit" className="min-h-11" disabled={busy || password === ""}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {t("report.public.unlock")}
          </Button>
        </form>
      )}

      {state.kind === "error" && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          {t(state.messageKey)}
        </p>
      )}

      {state.kind === "ready" && <ReportView report={state.report} />}
    </main>
  );
}
