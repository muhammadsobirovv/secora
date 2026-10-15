"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/// Module 15 — task #354 (Consistent error handling system). Next.js App
/// Router convention: this file automatically wraps every route segment
/// below `app/` in a React error boundary — no per-page wiring needed,
/// so it applies retroactively to every existing page without touching
/// any of them. Before this task, an uncaught render error anywhere in
/// the app fell through to Next's unstyled default crash screen.
///
/// Kept deliberately dependency-free of `useAuth`/`useDiagnostics`/React
/// Query — an error boundary has to render even when the thing that
/// crashed is state those hooks depend on, so it can't lean on the same
/// providers that may have been mid-render when the crash happened.
export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    console.error("Unhandled render error", error);
  }, [error]);

  async function handleCopy() {
    const details = [
      `Secora AI — unhandled error`,
      `Time: ${new Date().toISOString()}`,
      `Message: ${error.message}`,
      error.digest ? `Digest: ${error.digest}` : null,
      `URL: ${typeof window !== "undefined" ? window.location.href : "unknown"}`,
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(details);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail silently (permissions) — no further
      // fallback needed, the button simply won't show "Copied".
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" />
            <CardTitle className="text-base">Something went wrong</CardTitle>
          </div>
          <CardDescription>
            An unexpected error occurred while rendering this page. You can try again, or copy
            the error details if you need to report it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error.digest && (
            <p className="rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
              ref: {error.digest}
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => reset()}>
              <RefreshCw className="size-3.5" /> Try again
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleCopy()}>
              <Copy className="size-3.5" /> {copied ? "Copied" : "Copy error details"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
