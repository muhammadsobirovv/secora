"use client";

import * as React from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppVersionCheck } from "../hooks/use-app-version-check";

/// Module 14 — Auto Update. Rendered globally in `app/providers.tsx` (so
/// it works whether or not the viewer is logged in). Dismissible —
/// dismissal is per-tab (plain component state, not persisted): the
/// point is to inform, not nag, and a fresh page load already re-checks
/// from scratch anyway. Never auto-reloads; see
/// `useAppVersionCheck`'s doc comment for why.
export function UpdateAvailableBanner(): React.JSX.Element | null {
  const { updateAvailable } = useAppVersionCheck();
  const [dismissed, setDismissed] = React.useState(false);

  if (!updateAvailable || dismissed) return null;

  return (
    <div className="flex items-center justify-center gap-3 bg-primary px-4 py-2 text-sm text-primary-foreground">
      <span>A new version of Secora AI is available.</span>
      <Button
        variant="secondary"
        size="sm"
        className="h-7"
        onClick={() => window.location.reload()}
      >
        <RefreshCw className="size-3.5" />
        Refresh
      </Button>
      <button
        type="button"
        aria-label="Dismiss"
        className="rounded p-1 hover:bg-primary-foreground/10"
        onClick={() => setDismissed(true)}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
