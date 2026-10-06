"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/// Module 15 — task #354. Segment-scoped error boundary: a crash inside
/// one dashboard page (a findings table, a chart, an AI chat panel) is
/// caught here instead of bubbling up to the root `app/error.tsx`, which
/// would otherwise blow away the sidebar/header shell along with it. The
/// root boundary still exists as the fallback for a crash in the shell
/// itself (`DashboardShell`) or anywhere outside this segment.
export default function DashboardErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled render error in dashboard segment", error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <AlertTriangle className="size-6 text-destructive" />
      <p className="text-sm font-medium">This page ran into a problem.</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {error.digest ? `Reference: ${error.digest}` : "Try reloading this page, or go back to the dashboard."}
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => reset()}>
          <RefreshCw className="size-3.5" /> Try again
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
