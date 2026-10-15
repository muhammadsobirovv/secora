"use client";

import * as React from "react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { getCurrentUser } from "@/lib/api/auth";
import { apiFetch } from "@/lib/api/client";
import {
  clearStoredRefreshToken,
  getStoredRefreshToken,
  persistRefreshToken,
} from "@/lib/api/client";

/// Runs once at the app root. A page reload loses the in-memory access
/// token (lib/stores/auth-store.ts) but the refresh token survives in
/// localStorage — this silently exchanges it for a fresh access token
/// and the current user, so a reload doesn't bounce a logged-in user to
/// /login. Renders children immediately either way; consumers gate on
/// `isHydrated` if they need to know the check has finished.
export function SessionRestorer({ children }: { children: React.ReactNode }) {
  const setSession = useAuthStore((s) => s.setSession);
  const setHydrated = useAuthStore((s) => s.setHydrated);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  React.useEffect(() => {
    if (isHydrated) return;

    const refreshToken = getStoredRefreshToken();
    if (!refreshToken) {
      setHydrated();
      return;
    }

    apiFetch<{ accessToken: string; refreshToken: string }>("/auth/refresh", {
      method: "POST",
      body: { refreshToken },
      public: true,
    })
      .then(async (tokens) => {
        persistRefreshToken(tokens.refreshToken);
        useAuthStore.getState().setAccessToken(tokens.accessToken);
        const user = await getCurrentUser();
        setSession(tokens.accessToken, user);
      })
      .catch(() => {
        // Refresh token expired/invalid — stay logged out, no error UI
        // needed, the dashboard layout will redirect to /login. Must
        // also clear the stored token + the "secora_session" marker
        // cookie here (not just leave them for the next 401 interceptor
        // to clean up): proxy.ts redirects /login -> / whenever that
        // marker cookie is present, and if it's never cleared after a
        // failed refresh, a stale session survives as: "/" bounces to
        // "/login" client-side (no valid session), while the marker
        // cookie makes proxy.ts immediately bounce "/login" back to "/"
        // — an infinite redirect loop with no error ever surfaced.
        clearStoredRefreshToken();
      })
      .finally(() => setHydrated());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}
