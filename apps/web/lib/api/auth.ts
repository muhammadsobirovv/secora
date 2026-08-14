import { AUTH_ENDPOINTS } from "@pentesthub/shared";
import type {
  AuthenticatedUserDto,
  AuthTokensDto,
  ChangePasswordDto,
  LoginRequestDto,
  LoginResponseDto,
  MfaChallengeRequestDto,
  MfaConfirmRequestDto,
  MfaConfirmResponseDto,
  MfaDisableRequestDto,
  MfaSetupResponseDto,
  RegisterRequestDto,
  RegisterResponseDto,
  RequestPasswordResetDto,
  ResetPasswordDto,
  SessionSummaryDto,
} from "@pentesthub/shared";
import { API_BASE_URL, apiFetch } from "./client";

export function register(data: RegisterRequestDto) {
  return apiFetch<RegisterResponseDto>(AUTH_ENDPOINTS.register, {
    method: "POST",
    body: data,
    public: true,
  });
}

export function login(data: LoginRequestDto) {
  return apiFetch<LoginResponseDto>(AUTH_ENDPOINTS.login, {
    method: "POST",
    body: data,
    public: true,
  });
}

export function mfaChallenge(data: MfaChallengeRequestDto) {
  return apiFetch<AuthTokensDto>(AUTH_ENDPOINTS.mfaChallenge, {
    method: "POST",
    body: data,
    public: true,
  });
}

export function logout(refreshToken: string) {
  return apiFetch<void>(AUTH_ENDPOINTS.logout, { method: "POST", body: { refreshToken } });
}

export function getCurrentUser() {
  return apiFetch<AuthenticatedUserDto>(AUTH_ENDPOINTS.me);
}

export function verifyEmail(token: string) {
  return apiFetch<void>(AUTH_ENDPOINTS.verifyEmail, { method: "POST", body: { token }, public: true });
}

export function resendVerificationEmail(email: string) {
  return apiFetch<void>(AUTH_ENDPOINTS.resendVerificationEmail, {
    method: "POST",
    body: { email },
    public: true,
  });
}

export function requestPasswordReset(data: RequestPasswordResetDto) {
  return apiFetch<void>(AUTH_ENDPOINTS.requestPasswordReset, {
    method: "POST",
    body: data,
    public: true,
  });
}

export function resetPassword(data: ResetPasswordDto) {
  return apiFetch<void>(AUTH_ENDPOINTS.resetPassword, { method: "POST", body: data, public: true });
}

export function changePassword(data: ChangePasswordDto) {
  return apiFetch<void>(AUTH_ENDPOINTS.changePassword, { method: "POST", body: data });
}

export function mfaSetup() {
  return apiFetch<MfaSetupResponseDto>(AUTH_ENDPOINTS.mfaSetup, { method: "POST" });
}

export function mfaConfirm(data: MfaConfirmRequestDto) {
  return apiFetch<MfaConfirmResponseDto>(AUTH_ENDPOINTS.mfaConfirm, { method: "POST", body: data });
}

export function mfaDisable(data: MfaDisableRequestDto) {
  return apiFetch<void>(AUTH_ENDPOINTS.mfaDisable, { method: "POST", body: data });
}

export function listSessions() {
  return apiFetch<SessionSummaryDto[]>(AUTH_ENDPOINTS.sessions);
}

export function revokeSession(sessionId: string) {
  return apiFetch<void>(AUTH_ENDPOINTS.revokeSession.replace(":sessionId", sessionId), {
    method: "DELETE",
  });
}

export function oauthExchange(code: string) {
  return apiFetch<AuthTokensDto>("/auth/oauth/exchange", { method: "POST", body: { code }, public: true });
}

/// Module 15 — task #352 (demo mode). Mirrors `login`/`oauthExchange`:
/// hits a public, unauthenticated endpoint and gets back the same
/// `AuthTokensDto` shape any other sign-in path returns, so the caller
/// can pass the result straight into `useAuth().completeLogin(tokens)`.
export function startDemoSession() {
  return apiFetch<AuthTokensDto>("/demo/session", { method: "POST", public: true });
}

export function oauthStartUrl(provider: "google" | "github"): string {
  return `${API_BASE_URL}${provider === "google" ? AUTH_ENDPOINTS.oauthGoogleStart : AUTH_ENDPOINTS.oauthGithubStart}`;
}

export function isMfaRequired(res: LoginResponseDto): res is Extract<LoginResponseDto, { mfaRequired: true }> {
  return "mfaRequired" in res && res.mfaRequired === true;
}
