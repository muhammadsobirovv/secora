"use client";

import { Check, Loader2, Minus, X } from "lucide-react";
import type { VulnScanJobStatus } from "@pentesthub/shared";
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

/// Verify -> Recon -> Scan -> Report, drawn from the worker's "[stage]" log
/// lines. Four equal columns, so it fits a 360 px screen without scrolling.
export function PipelineStepper({
  logs,
  status,
}: {
  logs: ReadonlyArray<{ message: string }>;
  status: VulnScanJobStatus;
}) {
  const { t } = useI18n();
  const steps = deriveSteps(logs, status);

  return (
    <ol aria-label={t("scan.stepper.label")} className="grid grid-cols-4 gap-1">
      {steps.map((step, index) => (
        <li
          key={step.id}
          aria-current={step.state === "active" ? "step" : undefined}
          className="flex min-w-0 flex-col items-center gap-1.5 text-center"
        >
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-full border text-xs font-medium",
              DOT_CLASS[step.state],
            )}
          >
            <StepIcon state={step.state} index={index} />
          </span>
          <span
            className={cn(
              "w-full truncate text-xs",
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
