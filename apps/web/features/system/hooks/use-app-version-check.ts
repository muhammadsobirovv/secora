"use client";

import { useQuery } from "@tanstack/react-query";
import { getLiveness } from "@/lib/api/infrastructure";

const VERSION_CHECK_POLL_MS = 5 * 60_000;

/// Module 14 — Auto Update. `apps/web` is a Next.js app: there's no
/// native "download and install a new version" step the way there is
/// for `apps/desktop` (Tauri) or `apps/mobile` (Flutter) — a redeploy
/// simply serves new JS to the next page load. The gap this closes is
/// different: a browser tab left open across a redeploy is still
/// running the *old* JS bundle, silently, with no signal to the user
/// that a newer server version exists. Polling the liveness probe
/// (`OBSERVABILITY_HEALTH_ENDPOINTS.liveness()`, unauthenticated, no DB
/// dependency, safe to hit every few minutes) and comparing its
/// `version` field against `NEXT_PUBLIC_APP_VERSION` (baked into this
/// tab's bundle at the build time it was served from) is the standard
/// "stale SPA tab" detection pattern. Never triggers an automatic
/// reload — reloading out from under someone mid-task (e.g. writing a
/// report, mid-scan-configuration) would be worse than the staleness
/// itself; it only sets a flag `UpdateAvailableBanner` reads to show a
/// dismissible, user-initiated "Refresh" prompt.
export function useAppVersionCheck(): { updateAvailable: boolean } {
  const builtVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown";

  const { data } = useQuery({
    queryKey: ["app-version-check"],
    queryFn: getLiveness,
    refetchInterval: VERSION_CHECK_POLL_MS,
    // A version-check miss shouldn't spam retries or surface an error
    // banner of its own — silently try again on the next interval.
    retry: false,
  });

  const serverVersion = data?.version;
  const updateAvailable = Boolean(
    serverVersion && builtVersion !== "unknown" && serverVersion !== builtVersion,
  );

  return { updateAvailable };
}
