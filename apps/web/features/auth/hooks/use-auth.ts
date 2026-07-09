"use client";

import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";
import { clearStoredRefreshToken, getStoredRefreshToken, persistRefreshToken } from "@/lib/api/client";
import * as authApi from "@/lib/api/auth";
import type { AuthTokensDto } from "@pentesthub/shared";

export function useAuth() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const setSession = useAuthStore((s) => s.setSession);
  const clear = useAuthStore((s) => s.clear);

  async function completeLogin(tokens: AuthTokensDto) {
    persistRefreshToken(tokens.refreshToken);
    useAuthStore.getState().setAccessToken(tokens.accessToken);
    const currentUser = await authApi.getCurrentUser();
    setSession(tokens.accessToken, currentUser);
  }

  async function logout() {
    const refreshToken = getStoredRefreshToken();
    try {
      if (refreshToken) await authApi.logout(refreshToken);
    } finally {
      clearStoredRefreshToken();
      clear();
      router.push("/login");
    }
  }

  return { user, isHydrated, isAuthenticated: Boolean(user), completeLogin, logout };
}
