"use client";

import * as React from "react";
import { Check, Copy, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { TargetOwnershipChallengeDto, TargetOwnershipStatusDto } from "@pentesthub/shared";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/features/i18n/i18n-context";
import { ApiError } from "@/lib/api/client";
import * as targetsApi from "@/lib/api/targets";
import { cn } from "@/lib/utils";

/// Step between "target created" and "scan starts" in the quick-scan flow.
/// The user publishes one of three proofs (DNS TXT record, a file, or a meta
/// tag). Each value is copyable so it can be pasted on a phone. Nothing
/// active runs until the server confirms one of them.
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

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const current = await targetsApi.getTargetOwnership(targetId);
        const next = current.verified || current.challenge
          ? current
          : await targetsApi.createTargetOwnershipChallenge(targetId);
        if (!cancelled) setStatus(next);
        if (next.verified && !cancelled) onVerified();
      } catch (error) {
        if (!cancelled) toast.error(error instanceof ApiError ? error.message : t("ownership.checkError"));
      }
    })();
    return () => {
      cancelled = true;
    };
    // Loads once per target; onVerified/t are stable enough for this step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  async function handleVerify(): Promise<void> {
    setChecking(true);
    try {
      const next = await targetsApi.verifyTargetOwnership(targetId);
      setStatus(next);
      if (next.verified) {
        toast.success(t("ownership.verified"));
        onVerified();
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t("ownership.checkError"));
    } finally {
      setChecking(false);
    }
  }

  const challenge = status?.challenge ?? null;
  const errorKey = status?.lastError ? (`ownership.error.${status.lastError}` as const) : null;

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
            help={t("ownership.methodDnsHelp", { name: challenge.dnsRecordName })}
            value={challenge.dnsRecordValue}
          />
          <ProofBlock
            title={t("ownership.methodFile")}
            help={t("ownership.methodFileHelp", { url: challenge.httpUrl })}
            value={tokenOf(challenge)}
          />
          <ProofBlock title={t("ownership.methodMeta")} help={t("ownership.methodMetaHelp")} value={challenge.metaTag} />
        </div>
      )}

      {errorKey && <p className="text-sm text-destructive" role="status">{t(errorKey)}</p>}

      {challenge && (
        <div className="flex flex-col gap-2">
          <Button size="lg" className="h-11 w-full sm:w-auto" disabled={checking} onClick={() => void handleVerify()}>
            {checking ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t("ownership.verifying")}
              </>
            ) : (
              t("ownership.verify")
            )}
          </Button>
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

function ProofBlock({ title, help, value }: { title: string; help: string; value: string }) {
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
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground">{help}</p>
      <div className="flex items-stretch gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap">
          {value}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void copy()}
          className={cn("h-auto shrink-0 px-3", copied && "text-success")}
          aria-label={copied ? t("ownership.copied") : t("ownership.copy")}
        >
          {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
        </Button>
      </div>
    </div>
  );
}
