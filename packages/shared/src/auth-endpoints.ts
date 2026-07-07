// Canonical list of Auth module HTTP routes. Both apps/api (route registration)
// and apps/web (API client) should reference this instead of hardcoding paths.

export const AUTH_ENDPOINTS = {
  register: "/auth/register",
  login: "/auth/login",
  refresh: "/auth/refresh",
  logout: "/auth/logout",
  me: "/auth/me",

  verifyEmail: "/auth/verify-email",
  resendVerificationEmail: "/auth/verify-email/resend",

  requestPasswordReset: "/auth/password/forgot",
  resetPassword: "/auth/password/reset",
  changePassword: "/auth/password/change",

  oauthGoogleStart: "/auth/oauth/google",
  oauthGoogleCallback: "/auth/oauth/google/callback",
  oauthGithubStart: "/auth/oauth/github",
  oauthGithubCallback: "/auth/oauth/github/callback",

  mfaSetup: "/auth/mfa/setup",
  mfaConfirm: "/auth/mfa/confirm",
  mfaChallenge: "/auth/mfa/challenge",
  mfaDisable: "/auth/mfa/disable",

  sessions: "/auth/sessions",
  revokeSession: "/auth/sessions/:sessionId",
} as const;
