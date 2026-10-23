"use client";

import * as React from "react";
import { Check, Loader2, ShieldCheck } from "lucide-react";
import type { RoePublicRequestDto } from "@pentesthub/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/features/i18n/i18n-context";
import { ApiError } from "@/lib/api/client";
import * as roeApi from "@/lib/api/roe";
import { formatDateTime } from "@/lib/format";

type State =
  | { kind: "loading" }
  | { kind: "ready"; request: RoePublicRequestDto }
  | { kind: "done"; outcome: "approved" | "declined" | "revoked" }
  | { kind: "invalid" }
  | { kind: "error" };

/// The client's page, reached from the link in the email. No login: the
/// single-use link is the credential. Opening it only SHOWS the request; the
/// buttons are the only thing that changes anything (a POST), so a mail
/// scanner or link preview that merely opens the link can never approve.
export function PublicRoeView({ token, mode }: { token: string; mode: "approve" | "revoke" }) {
  const { t } = useI18n();
  const [state, setState] = React.useState<State>({ kind: "loading" });
  const [working, setWorking] = React.useState<"approve" | "decline" | "revoke" | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    roeApi
      .getPublicRoe(token)
      .then((request) => {
        if (cancelled) return;
        // An approval link opens the approval page, a revoke link the revoke page.
        const expected = mode === "approve" ? "APPROVAL" : "REVOKE";
        setState(request.kind === expected ? { kind: "ready", request } : { kind: "invalid" });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState(error instanceof ApiError && (error.code === "ROE_LINK_INVALID" || error.statusCode === 404) ? { kind: "invalid" } : { kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [token, mode]);

  async function decide(action: "approve" | "decline" | "revoke") {
    setWorking(action);
    try {
      await roeApi.decidePublicRoe(token, action);
      setState({ kind: "done", outcome: action === "approve" ? "approved" : action === "decline" ? "declined" : "revoked" });
    } catch (error) {
      setState(error instanceof ApiError && error.code === "ROE_LINK_INVALID" ? { kind: "invalid" } : { kind: "error" });
    } finally {
      setWorking(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-4 px-4 py-4">
      <header className="flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0" aria-hidden="true" /> {t("roe.public.banner")}
      </header>

      {state.kind === "loading" && (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {state.kind === "invalid" && (
        <p role="alert" className="rounded-lg border border-border bg-card p-4 text-sm">
          {t("roe.public.invalid")}
        </p>
      )}

      {state.kind === "error" && (
        <p role="alert" className="rounded-lg border border-border bg-card p-4 text-sm">
          {t("roe.public.loadError")}
        </p>
      )}

      {state.kind === "done" && (
        <div role="status" className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm">
          <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          <p>
            {t(state.outcome === "approved" ? "roe.public.approved" : state.outcome === "declined" ? "roe.public.declined" : "roe.public.revoked")}
          </p>
        </div>
      )}

      {state.kind === "ready" && (
        <>
          <h1 className="text-xl font-semibold">{t(mode === "approve" ? "roe.public.title" : "roe.public.revokeTitle")}</h1>
          <p className="text-sm break-words">
            {mode === "approve"
              ? t("roe.public.intro", {
                  requester: state.request.requesterName,
                  email: state.request.requesterEmail,
                  client: state.request.clientName,
                })
              : t("roe.public.revokeIntro", { client: state.request.clientName })}
          </p>

          <dl className="grid grid-cols-1 gap-x-4 gap-y-3 rounded-lg border border-border bg-card p-4 text-sm sm:grid-cols-[max-content_1fr]">
            <dt className="text-muted-foreground">{t("roe.public.organisation")}</dt>
            <dd className="break-words">{state.request.clientName}</dd>
            <dt className="text-muted-foreground">{t("roe.public.requester")}</dt>
            <dd className="break-words">
              {state.request.requesterName} ({state.request.requesterEmail})
            </dd>
            <dt className="text-muted-foreground">{t("roe.public.assets")}</dt>
            <dd>
              <ul className="flex flex-col gap-1">
                {state.request.assets.map((asset) => (
                  <li key={`${asset.type}-${asset.value}-${asset.wildcard}`} className="flex flex-col">
                    <span className="font-mono text-xs break-all">{asset.value}</span>
                    {asset.wildcard && <span className="text-xs font-medium break-words">{t("roe.public.wildcard")}</span>}
                  </li>
                ))}
              </ul>
            </dd>
            <dt className="text-muted-foreground">{t("roe.public.window")}</dt>
            <dd>
              {formatDateTime(state.request.windowStart)} – {formatDateTime(state.request.windowEnd)}
            </dd>
            <dt className="text-muted-foreground">{t("roe.public.signatory")}</dt>
            <dd className="break-words">
              {state.request.signatoryName}, {state.request.signatoryRole}
            </dd>
          </dl>

          {mode === "approve" && <p className="text-xs leading-relaxed text-muted-foreground">{t("roe.public.warning", { client: state.request.clientName })}</p>}

          <div className="flex flex-col gap-2 sm:flex-row">
            {mode === "approve" ? (
              <>
                <Button size="lg" className="h-11 w-full sm:w-auto" disabled={working !== null} onClick={() => void decide("approve")}>
                  {working === "approve" ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                  {working === "approve" ? t("roe.public.working") : t("roe.public.approve")}
                </Button>
                <Button size="lg" variant="outline" className="h-11 w-full sm:w-auto" disabled={working !== null} onClick={() => void decide("decline")}>
                  {working === "decline" ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                  {working === "decline" ? t("roe.public.working") : t("roe.public.decline")}
                </Button>
              </>
            ) : (
              <Button size="lg" variant="destructive" className="h-11 w-full sm:w-auto" disabled={working !== null} onClick={() => void decide("revoke")}>
                {working === "revoke" ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                {working === "revoke" ? t("roe.public.working") : t("roe.public.revoke")}
              </Button>
            )}
          </div>
        </>
      )}
    </main>
  );
}
