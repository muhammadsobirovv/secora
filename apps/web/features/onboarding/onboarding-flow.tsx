"use client";

import * as React from "react";
import Link from "next/link";
import { FolderKanban, Library, Radar, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { usePreferences, useUpdatePreferences } from "@/features/settings/hooks/use-preferences";
import { useWorkspace } from "@/features/workspace/hooks/use-workspace";
import { useAuth } from "@/features/auth/hooks/use-auth";

/// Module 15 — task #351 "First-run onboarding flow".
///
/// Mounted once in `DashboardShell` (alongside `CommandPalette`), so it
/// appears above whichever authenticated route a brand-new user lands on
/// first — not just the dashboard home page. Visibility is driven by a
/// single server-side signal: `UserPreferencesDto.onboardingCompletedAt`
/// (task #351's schema addition). Register already creates a personal
/// workspace for every new user (see `register.use-case.ts`), so this
/// flow never asks the user to create a workspace — it orients them
/// around the platform's real surfaces instead: create a project, run
/// recon or launch the AI Copilot, and find the docs portal (task #350).
///
/// Deliberately a small hand-rolled step sequence over the existing
/// `Dialog` primitive rather than a new stepper/wizard dependency — the
/// four steps below are static and don't need form-wizard machinery.
/// `role="dialog"`/focus trap/Escape-to-close come for free from Radix
/// (same reasoning as the accessibility audit's note on shadcn/Radix
/// components in task #349).
interface Step {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: { label: string; href: string };
}

function buildSteps(workspaceName: string | undefined): Step[] {
  return [
    {
      icon: ShieldCheck,
      title: "Welcome to Secora AI",
      description: workspaceName
        ? `Your workspace "${workspaceName}" is ready. Here's a quick tour of where to start.`
        : "Your workspace is ready. Here's a quick tour of where to start.",
    },
    {
      icon: FolderKanban,
      title: "Scan your first website",
      description: "Type your domain, confirm you own it, and Secora starts a scan. A project and target are created for you.",
      action: { label: "Scan a website", href: "/dashboard#quick-scan" },
    },
    {
      icon: Radar,
      title: "Run recon, or ask the AI Copilot",
      description:
        "Kick off a recon job against a target, or describe a goal in plain language and let the Agent Copilot plan and execute it for you.",
      action: { label: "Open AI Assistant", href: "/ai" },
    },
    {
      icon: Library,
      title: "Know where to find help",
      description: "Every module has a guide — architecture decisions, security reviews, release notes.",
      action: { label: "Browse documentation", href: "/docs" },
    },
  ];
}

export function OnboardingFlow() {
  const { isAuthenticated } = useAuth();
  const { data: preferences, isLoading } = usePreferences();
  const { data: workspace } = useWorkspace();
  const updatePreferences = useUpdatePreferences();
  const [stepIndex, setStepIndex] = React.useState(0);

  const shouldShow = isAuthenticated && !isLoading && preferences != null && preferences.onboardingCompletedAt === null;

  const steps = React.useMemo(() => buildSteps(workspace?.name), [workspace?.name]);
  const step = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  const finish = React.useCallback(() => {
    updatePreferences.mutate({ onboardingCompleted: true });
  }, [updatePreferences]);

  if (!shouldShow || !step) return null;

  const StepIcon = step.icon;

  return (
    <Dialog open onOpenChange={(open) => !open && finish()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <StepIcon className="size-5" />
          </div>
          <DialogTitle>{step.title}</DialogTitle>
          <DialogDescription>{step.description}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-1.5 py-1">
          {steps.map((s, i) => (
            <span
              key={s.title}
              aria-hidden="true"
              className={`h-1.5 rounded-full transition-all ${
                i === stepIndex ? "w-6 bg-primary" : "w-1.5 bg-muted"
              }`}
            />
          ))}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={finish} disabled={updatePreferences.isPending}>
            Skip
          </Button>
          <div className="flex gap-2">
            {step.action && (
              <Button variant="outline" asChild onClick={isLastStep ? finish : undefined}>
                <Link href={step.action.href}>{step.action.label}</Link>
              </Button>
            )}
            {isLastStep ? (
              <Button onClick={finish} disabled={updatePreferences.isPending}>
                {updatePreferences.isPending ? "Finishing…" : "Get started"}
              </Button>
            ) : (
              <Button onClick={() => setStepIndex((i) => i + 1)}>Next</Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
