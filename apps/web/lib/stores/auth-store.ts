import { create } from "zustand";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  /// True once we've either restored a session on app load or confirmed
  /// there isn't one — lets the dashboard layout avoid a flash of
  /// "redirecting to login" while the silent-refresh attempt is in flight.
  isHydrated: boolean;
  setSession: (accessToken: string, user: AuthUser) => void;
  setAccessToken: (accessToken: string) => void;
  setHydrated: () => void;
  clear: () => void;
}

/// Access token lives in memory only (this store); the refresh token
/// lives in localStorage (see lib/api/client.ts) so a page reload can
/// silently restore a session. This is the standard SPA pattern given
/// the backend deliberately has no cookie-based auth (see
/// docs/adr/0002-workspace-foundation-module.md, Decision 4) — accepted
/// tradeoff: localStorage is XSS-exposed, mitigated by the access
/// token's short TTL and this store never persisting it.
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isHydrated: false,
  setSession: (accessToken, user) => set({ accessToken, user }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setHydrated: () => set({ isHydrated: true }),
  clear: () => set({ accessToken: null, user: null }),
}));
