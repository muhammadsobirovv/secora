"use client";

import { useCallback, useState } from "react";
import { getHealthDiagnostics } from "@/lib/api/infrastructure";

export interface DiagnosticsReport {
  generatedAt: string;
  appVersion: string;
  serverVersion: string;
  versionsMatch: boolean;
  roundTripMs: number;
  server: {
    status: "ok" | "degraded";
    serverTime: string;
    uptimeSeconds: number;
    nodeEnv: string;
    databaseStatus: "ok" | "failed";
    databaseLatencyMs: number | null;
  };
  client: {
    userAgent: string;
    language: string;
    platform: string;
    online: boolean;
    timeZone: string;
    viewport: string;
  };
}

/// Module 15 — task #353 (Health & diagnostics). Client-side counterpart
/// to `HealthController.diagnostics()`: measures the actual round-trip
/// latency this browser sees (the server can only report its own DB
/// latency, not the network hop to get here), and pairs it with browser
/// environment info a support agent would otherwise have to ask for by
/// hand. Deliberately request-triggered rather than auto-polling — this
/// is a "run a self-test right now" tool, not a background monitor (that
/// job belongs to `useAppVersionCheck` and the Admin Console).
export function useDiagnostics() {
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setIsRunning(true);
    setError(null);
    const startedAt = performance.now();
    try {
      const data = await getHealthDiagnostics();
      const roundTripMs = Math.round(performance.now() - startedAt);
      const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown";

      setReport({
        generatedAt: new Date().toISOString(),
        appVersion,
        serverVersion: data.version,
        versionsMatch: appVersion === "unknown" ? true : appVersion === data.version,
        roundTripMs,
        server: {
          status: data.status,
          serverTime: data.serverTime,
          uptimeSeconds: data.uptimeSeconds,
          nodeEnv: data.nodeEnv,
          databaseStatus: data.checks.database.status,
          databaseLatencyMs: data.checks.database.latencyMs,
        },
        client: {
          userAgent: navigator.userAgent,
          language: navigator.language,
          platform: navigator.platform,
          online: navigator.onLine,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
        },
      });
    } catch {
      // The API being unreachable is itself the diagnostic result, not a
      // failure of this hook — record it in the report rather than
      // swallowing it as a generic error state.
      const roundTripMs = Math.round(performance.now() - startedAt);
      setError(`Could not reach the API after ${roundTripMs}ms. The server may be down or unreachable from this network.`);
    } finally {
      setIsRunning(false);
    }
  }, []);

  return { report, isRunning, error, run };
}
