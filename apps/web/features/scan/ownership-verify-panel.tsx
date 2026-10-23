"use client";

import * as React from "react";
import { Check, ChevronDown, Copy, Loader2, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { TargetOwnershipChallengeDto, TargetOwnershipStatusDto } from "@pentesthub/shared";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/features/i18n/i18n-context";
import { ApiError } from "@/lib/api/client";
import * as targetsApi from "@/lib/api/targets";
import { cn } from "@/lib/utils";
import { pollDecision, secondsToNextCheck } from "./ownership-poll";

/// Step between "target created" and "scan starts" in the quick-scan flow.
/// One recommended proof comes first (the DNS TXT record, with a copy button);
/// the file and meta-tag proofs wait under "Other methods". While the page is
/// open it re-checks by itself every 30 seconds for up to 30 minutes, then
/// leaves the checking to the user. Nothing active runs until the server
/// confirms one of the proofs, and the scan starts as soon as it does.
export function OwnershipVerifyPanel({
  targetId,
  targetLabel,
  onVerified,
}: {
  targetId: string;
  targetLabel: string;
  onVerified: () => void;
}) {
  const { t } = useI18n();
  const [status, setStatus] = React.useState<TargetOwnershipStatusDto | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [stopped, setStopped] = React.useState(false);
  const [seconds, setSeconds] = React.useState(30);
  const [adminCopied, setAdminCopied] = React.useState(false);

  // The poller's clocks live in refs so the 1 s tick never restarts.
  const openedAt = React.useRef(Date.now());
  const lastCheckAt = React.useRef(Date.now());
  const busy = React.useRef(false);
  const done = React.useRef(false);
  const onVerifiedRef = React.useRef(onVerified);
  onVerifiedRef.current = onVerified;

  const finish = React.useCallback((next: TargetOwnershipStatusDto) => {
    if (done.current) return;
    done.current = true;
    setStatus(next);
    onVerifiedRef.current();
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const current = await targetsApi.getTargetOwnership(targetId);
        const next = current.verified || current.challenge ? current : await targetsApi.createTargetOwnershipChallenge(targetId);
        if (cancelled) return;
        setStatus(next);
        openedAt.current = Date.now();
        lastCheckAt.current = Date.now();
        if (next.verified) finish(next);
      } catch (error) {
        if (!cancelled) toast.error(error instanceof ApiError ? error.message : t("ownership.checkError"));
      }
    })();
    return () => {
      cancelled = true;
    };
    // Loads once per target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  /// One check. `automatic` checks stay quiet when the server says "too soon"
  /// and never toast a network blip; a manual check always answers the user.
  const runCheck = React.useCallback(
    async (automatic: boolean) => {
      if (busy.current || done.current) return;
      busy.current = true;
      lastCheckAt.current = Date.now();
      setChecking(true);
      try {
        const next = await targetsApi.verifyTargetOwnership(targetId);
        setStatus(next);
        if (next.verified) {
          toast.success(t("ownership.verified"));
          finish(next);
        }
      } catch (error) {
        if (error instanceof ApiError && error.code === "OWNERSHIP_CHECK_TOO_SOON") {
          if (!automatic) toast.message(t("ownership.tooSoon"));
        } else if (!automatic) {
          toast.error(error instanceof ApiError ? error.message : t("ownership.checkError"));
        }
      } finally {
        busy.current = false;
        setChecking(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targetId, finish],
  );

  const hasChallenge = Boolean(status?.challenge) && !status?.verified;
  React.useEffect(() => {
    if (!hasChallenge || stopped) return;
    const tick = window.setInterval(() => {
      const now = Date.now();
      const decision = pollDecision({
        elapsedMs: now - openedAt.current,
        sinceLastCheckMs: now - lastCheckAt.current,
        busy: busy.current,
      });
      setSeconds(secondsToNextCheck(now - lastCheckAt.current));
      if (decision === "stop") setStopped(true);
      else if (decision === "check") void runCheck(true);
    }, 1000);
    return () => window.clearInterval(tick);
  }, [hasChallenge, stopped, runCheck]);

  const challenge = status?.challenge ?? null;
  const errorKey = status?.lastError ? (`ownership.error.${status.lastError}` as const) : null;

  async function copyAdminMessage(current: TargetOwnershipChallengeDto): Promise<void> {
    const host = current.dnsRecordName.replace(/^_secora-verify\./, "");
    const message = t("ownership.adminMessage", { host, name: current.dnsRecordName, value: current.dnsRecordValue });
    try {
      await navigator.clipboard.writeText(message);
      setAdminCopied(true);
      toast.success(t("ownership.adminCopied"));
      window.setTimeout(() => setAdminCopied(false), 2500);
    } catch {
      // Clipboard blocked: the record itself is still selectable above.
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-primary/40 bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <ShieldCheck className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{t("ownership.title")}</h3>
          <p className="text-sm text-muted-foreground">{t("ownership.subtitle")}</p>
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{targetLabel}</p>
        </div>
      </div>

      {!status && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t("ownership.verifying")}
        </div>
      )}

      {challenge && (
        <div className="flex flex-col gap-3">
          <ProofBlock
            title={t("ownership.methodDns")}
            badge={t("ownership.recommended")}
            help={t("ownership.methodDnsHelp", { name: challenge.dnsRecordName })}
            value={challenge.dnsRecordValue}
          />

          <details className="group rounded-lg border border-border">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
              {t("ownership.otherMethods")}
              <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="flex flex-col gap-3 border-t border-border p-3">
              <ProofBlock
                title={t("ownership.methodFile")}
                help={t("ownership.methodFileHelp", { url: challenge.httpUrl })}
                value={tokenOf(challenge)}
              />
              <ProofBlock title={t("ownership.methodMeta")} help={t("ownership.methodMetaHelp")} value={challenge.metaTag} />
            </div>
          </details>
        </div>
      )}

      {errorKey && (
        <p className="text-sm text-destructive" role="status">
          {t(errorKey)}
        </p>
      )}

      {challenge && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button size="lg" className="h-11 w-full sm:w-auto" disabled={checking} onClick={() => void runCheck(false)}>
              {checking ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t("ownership.verifying")}
                </>
              ) : stopped ? (
                t("ownership.checkAgain")
              ) : (
                t("ownership.verify")
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-11 w-full sm:w-auto"
              onClick={() => void copyAdminMessage(challenge)}
            >
              {adminCopied ? <Check aria-hidden="true" /> : <Send aria-hidden="true" />}
              {t("ownership.sendAdmin")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
            {stopped ? t("ownership.autoStopped") : `${t("ownership.autoChecking")} ${checking ? "" : t("ownership.nextCheck", { seconds })}`}
          </p>
          <p className="text-xs text-muted-foreground">{t("ownership.passiveOnly")}</p>
        </div>
      )}
    </div>
  );
}

/// The file's whole content is the bare token, taken from the meta tag value
/// so the panel does not need a second field in the API.
function tokenOf(challenge: TargetOwnershipChallengeDto): string {
  return /content="([^"]+)"/.exec(challenge.metaTag)?.[1] ?? "";
}

function ProofBlock({ title, help, value, badge }: { title: string; help: string; value: string; badge?: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = React.useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the value stays selectable.
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{title}</span>
        {badge && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">{badge}</span>}
      </div>
      <p className="text-xs break-words text-muted-foreground">{help}</p>
      <div className="flex items-stretch gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap">
          {value}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void copy()}
          className={cn("h-auto min-w-11 shrink-0 px-3", copied && "text-success")}
          aria-label={copied ? t("ownership.copied") : t("ownership.copy")}
        >
          {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
        </Button>
      </div>
    </div>
  );
}
