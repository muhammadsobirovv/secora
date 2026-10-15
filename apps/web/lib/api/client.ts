import type { ApiErrorResponse, ApiSuccessResponse, AppErrorCode } from "@pentesthub/shared";
import { useAuthStore } from "@/lib/stores/auth-store";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const REFRESH_TOKEN_KEY = "secora_refresh_token";
const SESSION_COOKIE_NAME = "secora_session";

export class ApiError extends Error {
  constructor(
    public readonly code: AppErrorCode | "UNKNOWN_ERROR",
    message: string,
    public readonly statusCode: number,
    // Module 15 — task #354. Mirrors the API's `X-Request-Id` /
    // `ApiErrorResponse.requestId` — carried onto the thrown error so any
    // catch site (error boundary, toast, Diagnostics-style "copy report")
    // can surface it for cross-referencing against server logs.
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getStoredRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

/// Also stamps a plain (non-httpOnly) marker cookie so middleware.ts can
/// redirect at the edge without a flash of protected content — the real
/// authorization boundary is still the API's JWT validation, this is a
/// UX nicety only (see docs/adr/0002-workspace-foundation-module.md,
/// Decision 4).
///
/// Module 18 — task #523 (Phase 21 security headers audit). `Secure` is
/// appended conditionally rather than hardcoded: `location.protocol` is
/// `'https:'` in every real deployment, but hardcoding `Secure`
/// unconditionally would make this cookie silently never get set during
/// local `http://localhost` development (browsers refuse to store a
/// `Secure` cookie over a plain-HTTP origin) — this was a genuinely
/// missing attribute before this change (grepped this file and found no
/// `Secure` anywhere), not something previously guarded some other way.
export function persistRefreshToken(token: string): void {
  window.localStorage.setItem(REFRESH_TOKEN_KEY, token);
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${SESSION_COOKIE_NAME}=1; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax${secure}`;
}

export function clearStoredRefreshToken(): void {
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  document.cookie = `${SESSION_COOKIE_NAME}=; path=/; max-age=0`;
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return null;

  // Coalesce concurrent 401s into one refresh call instead of a stampede.
  refreshPromise ??= (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        clearStoredRefreshToken();
        useAuthStore.getState().clear();
        return null;
      }
      const body = (await res.json()) as ApiSuccessResponse<{
        accessToken: string;
        refreshToken: string;
      }>;
      persistRefreshToken(body.data.refreshToken);
      useAuthStore.getState().setAccessToken(body.data.accessToken);
      return body.data.accessToken;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /// Skip attaching Authorization / retrying on 401 — for the auth
  /// endpoints themselves (login, register, refresh).
  public?: boolean;
}

export const LEGAL_ACCEPT_PATH = "/legal/accept";

function redirectToLegalAcceptance() {
  if (typeof window === "undefined") return;
  const { pathname, search } = window.location;
  if (pathname === LEGAL_ACCEPT_PATH) return;
  window.location.assign(`${LEGAL_ACCEPT_PATH}?next=${encodeURIComponent(pathname + search)}`);
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { body, public: isPublic, headers, ...rest } = options;
  const isFormData = body instanceof FormData;

  async function doFetch(): Promise<Response> {
    const accessToken = useAuthStore.getState().accessToken;
    return fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(accessToken && !isPublic ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
      body: isFormData ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  let res = await doFetch();

  if (res.status === 401 && !isPublic) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await doFetch();
    }
  }

  if (res.status === 204) return undefined as T;

  const json = (await res.json()) as ApiSuccessResponse<T> | ApiErrorResponse;

  if (!res.ok || !("success" in json) || !json.success) {
    const err = json as ApiErrorResponse;
    // The API gates every authenticated route until the current legal
    // version is accepted. Send the user to the acceptance screen from
    // wherever the first gated call happens, remembering where they were.
    if (res.status === 403 && err.code === "LEGAL_ACCEPTANCE_REQUIRED") {
      redirectToLegalAcceptance();
    }
    throw new ApiError(
      (err.code as AppErrorCode) ?? "UNKNOWN_ERROR",
      err.message ?? "Something went wrong.",
      res.status,
      err.requestId,
    );
  }

  return json.data;
}
