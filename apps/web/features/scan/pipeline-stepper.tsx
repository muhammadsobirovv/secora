"use client";

import { Check, Loader2, Minus, X } from "lucide-react";
import type { VulnScanJobStatus, VulnScanProfile } from "@pentesthub/shared";
import { useI18n } from "@/features/i18n/i18n-context";
import { cn } from "@/lib/utils";
import { deriveSteps, type StepState } from "./stage-state";

/// All colours come from theme tokens (primary, success, destructive, border,
/// muted), so the stepper follows the red/blue track and light/dark themes.
const DOT_CLASS: Record<StepState, string> = {
  pending: "border-border text-muted-foreground",
  active: "border-primary bg-primary/15 text-primary",
  done: "border-success bg-success/15 text-success",
  skipped: "border-border bg-muted text-muted-foreground",
  failed: "border-destructive bg-destructive/15 text-destructive",
};

function StepIcon({ state, index }: { state: StepState; index: number }) {
  if (state === "done") return <Check className="size-4" aria-hidden="true" />;
  if (state === "active") return <Loader2 className="size-4 animate-spin" aria-hidden="true" />;
  if (state === "failed") return <X className="size-4" aria-hidden="true" />;
  if (state === "skipped") return <Minus className="size-4" aria-hidden="true" />;
  return <span aria-hidden="true">{index + 1}</span>;
}

/// Verify -> the profile's stages -> Report, drawn from the worker's "[stage]"
/// log lines. Two columns on a 360 px phone (a profile can have up to nine
/// stages), more as the screen grows; each step is a dot beside its name, so
/// nothing is cut off and nothing scrolls sideways.
export function PipelineStepper({
  logs,
  status,
  profile,
}: {
  logs: ReadonlyArray<{ message: string }>;
  status: VulnScanJobStatus;
  profile?: VulnScanProfile | null;
}) {
  const { t } = useI18n();
  const steps = deriveSteps(logs, status, profile);

  return (
    <ol aria-label={t("scan.stepper.label")} className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
      {steps.map((step, index) => (
        <li
          key={step.id}
          aria-current={step.state === "active" ? "step" : undefined}
          className="flex min-w-0 items-center gap-2"
        >
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
              DOT_CLASS[step.state],
            )}
          >
            <StepIcon state={step.state} index={index} />
          </span>
          <span
            className={cn(
              "min-w-0 truncate text-sm",
              step.state === "pending" || step.state === "skipped" ? "text-muted-foreground" : "font-medium",
            )}
          >
            {t(`scan.stage.${step.id}` as const)}
          </span>
          <span className="sr-only">{t(`scan.stage.state.${step.state}` as const)}</span>
        </li>
      ))}
    </ol>
  );
}
