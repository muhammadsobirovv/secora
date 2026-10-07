"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import * as legalApi from "@/lib/api/legal";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useKeyboardShortcuts } from "@/lib/hooks/use-keyboard-shortcuts";
import { OnboardingFlow } from "@/features/onboarding/onboarding-flow";
import { DemoBanner } from "@/features/workspace/components/demo-banner";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { CommandPalette } from "./command-palette";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isHydrated } = useAuth();
  useKeyboardShortcuts();

  // "/" doubles as the public marketing landing page (app/(dashboard)/page.tsx
  // now renders marketing copy, not the dashboard — that moved to
  // "/dashboard"). proxy.ts already redirects a signed-in visitor away from
  // "/" to "/dashboard" at the edge, so in the normal case this component
  // only ever renders "/" for a signed-out visitor. The client-side check
  // below is just a safety net for the rare race where hydration completes
  // after render (e.g. a stale-but-still-valid session restored client-side).
  const isPublicRoot = pathname === "/";

  React.useEffect(() => {
    if (!isHydrated) return;
    if (!isAuthenticated && !isPublicRoot) {
      router.replace("/login");
    } else if (isAuthenticated && isPublicRoot) {
      router.replace("/dashboard");
    }
  }, [isHydrated, isAuthenticated, isPublicRoot, router]);

  // Send a signed-in user who hasn't accepted the current legal version to
  // the acceptance screen before any dashboard chrome renders. (apiFetch
  // also redirects on the API's 403 LEGAL_ACCEPTANCE_REQUIRED — this just
  // avoids flashing the dashboard first.)
  const legalStatus = useQuery({
    queryKey: ["legal-status"],
    queryFn: legalApi.getLegalStatus,
    enabled: isHydrated && isAuthenticated && !isPublicRoot,
    staleTime: 5 * 60 * 1000,
  });
  const acceptanceRequired = legalStatus.data?.acceptanceRequired === true;
  React.useEffect(() => {
    if (acceptanceRequired) {
      router.replace(`/legal/accept?next=${encodeURIComponent(pathname)}`);
    }
  }, [acceptanceRequired, pathname, router]);

  if (isPublicRoot && (!isHydrated || !isAuthenticated)) {
    // No sidebar/header chrome — the marketing page owns its own full layout.
    return <>{children}</>;
  }

  if (!isHydrated || !isAuthenticated || acceptanceRequired) {
    return (
      <div className="flex h-svh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-svh overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <DemoBanner />
        <Header />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
      <CommandPalette />
      {/* Module 15 — task #351: mounted at the shell level (not just the
          dashboard home page) so it appears above whichever authenticated
          route a brand-new user lands on first. Self-gates on
          preferences.onboardingCompletedAt — renders nothing once done. */}
      <OnboardingFlow />
    </div>
  );
}
