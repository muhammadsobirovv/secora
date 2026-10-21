"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import type { TargetAuthorizationBasis } from "@pentesthub/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/features/i18n/i18n-context";
import { EMPTY_TARGET_AUTHORIZATION, toAttestRequest } from "@/features/targets/components/target-authorization-fields";
import { ApiError } from "@/lib/api/client";
import { scanErrorKey } from "@/features/targets/scan-error-message";
import * as projectsApi from "@/lib/api/projects";
import * as targetsApi from "@/lib/api/targets";
import * as vulnApi from "@/lib/api/vuln";
import { cn } from "@/lib/utils";
import { parseScanInput } from "./parse-scan-input";
import { OwnershipVerifyPanel } from "./ownership-verify-panel";

const BASES: { value: TargetAuthorizationBasis; labelKey: "quickScan.owner" | "quickScan.permission" }[] = [
  { value: "OWNER", labelKey: "quickScan.owner" },
  { value: "WRITTEN_PERMISSION", labelKey: "quickScan.permission" },
];

/// One-field "scan my website" flow. It wraps the platform's normal steps
/// (project → target with a recorded authorization → vulnerability scan job)
/// so a new user goes from a domain to a running scan in one click. Every
/// guard stays in force: the target carries an explicit attestation, and the
/// API still refuses active scans without a valid authorization.
export function QuickScanCard() {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [input, setInput] = React.useState("");
  const [basis, setBasis] = React.useState<TargetAuthorizationBasis>("OWNER");
  const [attested, setAttested] = React.useState(false);
  const [invalid, setInvalid] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  // Target waiting for proof of ownership before an active scan may start.
  const [pending, setPending] = React.useState<{ id: string; label: string } | null>(null);

  function startErrorMessage(error: unknown): string {
    const key = scanErrorKey(error);
    if (key) return t(key);
    return error instanceof ApiError ? error.message : t("quickScan.error");
  }

  // "{aup}" in the translated sentence becomes the link, wherever the language
  // places it.
  const consentParts = t("scan.aup.consent", { aup: "\u0000" }).split("\u0000");

  async function startScan(targetId: string) {
    const job = await vulnApi.createVulnScanJob(targetId, { scanners: ["NUCLEI"], profile: "QUICK" });
    await queryClient.invalidateQueries();
    router.push(`/vuln/jobs/${job.id}`);
  }

  async function handleOwnershipVerified(targetId: string) {
    setBusy(true);
    try {
      await startScan(targetId);
    } catch (error) {
      toast.error(startErrorMessage(error));
      setBusy(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = parseScanInput(input);
    if (!parsed) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setBusy(true);
    try {
      const projectName = t("quickScan.projectName");
      const projects = await projectsApi.listProjects();
      const project =
        projects.find((p) => p.name === projectName && p.status !== "ARCHIVED") ??
        (await projectsApi.createProject({ name: projectName }));

      const authorization = toAttestRequest({ ...EMPTY_TARGET_AUTHORIZATION, basis, attested });
      const existing = (await targetsApi.listTargets(project.id)).find(
        (target) => target.type === parsed.type && target.value === parsed.value,
      );
      let targetId: string;
      if (existing) {
        // Scanning the same site again: refresh its authorization instead of failing on a duplicate.
        await targetsApi.attestTargetAuthorization(existing.id, authorization);
        targetId = existing.id;
      } else {
        const created = await targetsApi.createTarget(project.id, {
          type: parsed.type,
          value: parsed.value,
          scopeStatus: "IN_SCOPE",
          authorization,
        });
        targetId = created.id;
      }

      // Active scans need proof of control. Until it is verified, show the
      // verification step; the scan starts from the panel's onVerified.
      const ownership = await targetsApi.getTargetOwnership(targetId);
      if (!ownership.verified) {
        setPending({ id: targetId, label: `${parsed.type} ${parsed.value}` });
        setBusy(false);
        return;
      }
      await startScan(targetId);
    } catch (error) {
      toast.error(startErrorMessage(error));
      setBusy(false);
    }
  }

  return (
    <Card id="quick-scan" className="scroll-mt-24 border-primary/40 bg-gradient-to-br from-primary/10 via-card to-card">
      <CardContent className="flex flex-col gap-5 p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">{t("quickScan.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("quickScan.subtitle")}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1">
              <Label htmlFor="quick-scan-input" className="sr-only">
                {t("quickScan.title")}
              </Label>
              <Input
                id="quick-scan-input"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setInvalid(false);
                }}
                placeholder={t("quickScan.placeholder")}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                inputMode="url"
                aria-invalid={invalid}
                aria-describedby={invalid ? "quick-scan-error" : undefined}
                disabled={busy}
                className="h-11 text-base"
              />
              {invalid && (
                <p id="quick-scan-error" role="alert" className="mt-1.5 text-xs text-destructive">
                  {t("quickScan.invalid")}
                </p>
              )}
            </div>
            <Button type="submit" size="lg" disabled={busy || !attested || input.trim() === ""} className="h-11">
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t("quickScan.submitting")}
                </>
              ) : (
                <>
                  {t("quickScan.submit")} <ArrowRight aria-hidden="true" />
                </>
              )}
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            <div role="group" aria-label={t("quickScan.basisLabel")} className="flex flex-wrap gap-2">
              {BASES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={basis === option.value}
                  disabled={busy}
                  onClick={() => setBasis(option.value)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm transition-colors",
                    basis === option.value
                      ? "border-primary bg-primary/10 font-medium text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(option.labelKey)}
                </button>
              ))}
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="quick-scan-attest"
                checked={attested}
                onCheckedChange={(checked) => setAttested(checked === true)}
                disabled={busy}
                className="mt-0.5"
              />
              <Label htmlFor="quick-scan-attest" className="text-xs leading-relaxed font-normal text-muted-foreground">
                {t("targetAuth.attest")}
              </Label>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {consentParts.map((part, index) => (
              <React.Fragment key={index}>
                {index > 0 && (
                  <Link href="/legal/acceptable-use" className="text-primary underline underline-offset-2">
                    {t("scan.aup.link")}
                  </Link>
                )}
                {part}
              </React.Fragment>
            ))}
          </p>
        </form>

        {pending && (
          <OwnershipVerifyPanel
            targetId={pending.id}
            targetLabel={pending.label}
            onVerified={() => void handleOwnershipVerified(pending.id)}
          />
        )}

        <p className="text-xs text-muted-foreground">{t("quickScan.note")}</p>
      </CardContent>
    </Card>
  );
}
