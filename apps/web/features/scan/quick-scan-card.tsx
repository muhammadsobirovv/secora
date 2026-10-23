"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import type { RoeAssetDto, RoeAuthorizationDto, TargetAuthorizationBasis } from "@pentesthub/shared";
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
import { ClientEngagementFlow } from "./client-engagement-flow";

/// The two ways to be allowed to scan: you own the site (proved with a DNS
/// record), or you test for a client who approves in writing by email.
type ScanMode = "own" | "client";
const MODES: {
  value: ScanMode;
  labelKey: "quickScan.modeOwn" | "quickScan.modeClient";
  hintKey: "quickScan.modeOwnHint" | "quickScan.modeClientHint";
}[] = [
  { value: "own", labelKey: "quickScan.modeOwn", hintKey: "quickScan.modeOwnHint" },
  { value: "client", labelKey: "quickScan.modeClient", hintKey: "quickScan.modeClientHint" },
];

const OWN_BASIS: TargetAuthorizationBasis = "OWNER";

const STEP_KEYS = [
  "quickScan.steps.add",
  "quickScan.steps.verify",
  "quickScan.steps.choose",
  "quickScan.steps.watch",
  "quickScan.steps.read",
] as const;

/// The two depths offered here. The deep profile (default-credential checks,
/// port scan, content discovery) needs an explicit confirmation and an operator
/// switch, so it is only available through the API.
type QuickProfile = "QUICK" | "STANDARD";
const PROFILES: {
  value: QuickProfile;
  labelKey: "quickScan.profile.quick" | "quickScan.profile.standard";
  hintKey: "quickScan.profile.quickHint" | "quickScan.profile.standardHint";
}[] = [
  { value: "QUICK", labelKey: "quickScan.profile.quick", hintKey: "quickScan.profile.quickHint" },
  { value: "STANDARD", labelKey: "quickScan.profile.standard", hintKey: "quickScan.profile.standardHint" },
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
  const searchParams = useSearchParams();
  const roeParam = searchParams.get("roe");
  // ?roe=<id> continues an existing request; ?roe=new just opens the client path.
  const resumeRoe = roeParam && roeParam !== "new" ? roeParam : null;
  const [mode, setMode] = React.useState<ScanMode>(roeParam ? "client" : "own");
  const [attested, setAttested] = React.useState(false);
  const [profile, setProfile] = React.useState<QuickProfile>("QUICK");
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
    const job = await vulnApi.createVulnScanJob(targetId, { scanners: ["NUCLEI"], profile });
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

  /// Client path: the approved asset becomes a target (recorded as written
  /// permission) and the scan starts. The API checks the engagement again, so
  /// a request that was withdrawn a moment ago is refused there.
  async function scanApprovedAsset(_roe: RoeAuthorizationDto, asset: RoeAssetDto) {
    try {
      const projectName = t("quickScan.projectName");
      const projects = await projectsApi.listProjects();
      const project =
        projects.find((p) => p.name === projectName && p.status !== "ARCHIVED") ??
        (await projectsApi.createProject({ name: projectName }));
      const authorization = toAttestRequest({ ...EMPTY_TARGET_AUTHORIZATION, basis: "WRITTEN_PERMISSION", attested: true });
      const type = asset.type === "URL" ? "URL" : "DOMAIN";
      const existing = (await targetsApi.listTargets(project.id)).find((target) => target.type === type && target.value === asset.value);
      let targetId: string;
      if (existing) {
        await targetsApi.attestTargetAuthorization(existing.id, authorization);
        targetId = existing.id;
      } else {
        const created = await targetsApi.createTarget(project.id, { type, value: asset.value, scopeStatus: "IN_SCOPE", authorization });
        targetId = created.id;
      }
      setBusy(true);
      await startScan(targetId);
    } catch (error) {
      toast.error(startErrorMessage(error));
      setBusy(false);
      throw error;
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

      const authorization = toAttestRequest({ ...EMPTY_TARGET_AUTHORIZATION, basis: OWN_BASIS, attested });
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

        <ol
          aria-label={t("quickScan.steps.label")}
          className="grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-5"
        >
          {STEP_KEYS.map((key, index) => (
            <li key={key} className="flex items-center gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px]">
                {index + 1}
              </span>
              {t(key)}
            </li>
          ))}
        </ol>

        <div className="flex flex-col gap-1.5">
          <div role="group" aria-label={t("quickScan.modeLabel")} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {MODES.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={mode === option.value}
                disabled={busy}
                onClick={() => setMode(option.value)}
                className={cn(
                  "min-h-11 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  mode === option.value
                    ? "border-primary bg-primary/10 font-medium text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {t(option.labelKey)}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t(MODES.find((option) => option.value === mode)!.hintKey)}</p>
        </div>

        {mode === "client" && (
          <>
            <ProfilePicker profile={profile} onChange={setProfile} disabled={busy} />
            <ClientEngagementFlow resumeId={resumeRoe} onScan={scanApprovedAsset} busy={busy} />
          </>
        )}

        {mode === "own" && (
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
            <ProfilePicker profile={profile} onChange={setProfile} disabled={busy} />

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
        )}

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

/// The two scan depths offered here (QUICK, STANDARD). DEEP is not offered in
/// the interface at all.
function ProfilePicker({
  profile,
  onChange,
  disabled,
}: {
  profile: QuickProfile;
  onChange: (profile: QuickProfile) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-1.5">
      <div role="group" aria-label={t("quickScan.profile.label")} className="flex flex-wrap gap-2">
        {PROFILES.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={profile === option.value}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-11 rounded-full border px-4 py-1 text-sm transition-colors",
              profile === option.value
                ? "border-primary bg-primary/10 font-medium text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {t(option.labelKey)}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t(PROFILES.find((option) => option.value === profile)!.hintKey)}</p>
    </div>
  );
}
