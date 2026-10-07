// Auth module API contracts shared between apps/api and apps/web.
// Keep in sync with apps/api/prisma/schema.prisma — see docs/modules/01-auth.md.

export type OAuthProvider = "GOOGLE" | "GITHUB";

// --- Registration & login -------------------------------------------------

export interface RegisterRequestDto {
  email: string;
  password: string;
  displayName: string;
  /// The LEGAL_VERSION the user accepted on the signup form. Required:
  /// the API rejects signup unless it equals the current version.
  acceptedLegalVersion: string;
}

export interface RegisterResponseDto {
  user: AuthenticatedUserDto;
  message: string;
}

export interface LoginRequestDto {
  email: string;
  password: string;
  rememberMe?: boolean;
}

/// Returned instead of AuthTokensDto when the account has MFA enabled —
/// the client must call POST /auth/mfa/challenge with mfaChallengeToken.
export interface MfaRequiredResponseDto {
  mfaRequired: true;
  mfaChallengeToken: string;
}

export type LoginResponseDto = AuthTokensDto | MfaRequiredResponseDto;

export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RefreshRequestDto {
  refreshToken: string;
}

export interface LogoutRequestDto {
  refreshToken: string;
}

// --- User -------------------------------------------------------------------

export interface AuthenticatedUserDto {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  createdAt: string;
}

// --- Email verification ------------------------------------------------------

export interface VerifyEmailRequestDto {
  token: string;
}

export interface ResendVerificationEmailRequestDto {
  email: string;
}

// --- Password reset / change --------------------------------------------------

export interface RequestPasswordResetDto {
  email: string;
}

export interface ResetPasswordDto {
  token: string;
  newPassword: string;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

// --- OAuth --------------------------------------------------------------------

export interface OAuthAccountSummaryDto {
  provider: OAuthProvider;
  linkedAt: string;
}

// --- MFA (TOTP) -----------------------------------------------------------------

export interface MfaSetupResponseDto {
  secret: string;
  otpAuthUrl: string;
  qrCodeDataUrl: string;
}

export interface MfaConfirmRequestDto {
  code: string;
}

export interface MfaConfirmResponseDto {
  backupCodes: string[];
}

export interface MfaChallengeRequestDto {
  mfaChallengeToken: string;
  code: string;
}

export interface MfaDisableRequestDto {
  code: string;
  // Re-proves account ownership before permanently disabling MFA — same
  // pattern as ChangePasswordDto. Without this, a live (stolen) access
  // token plus one captured MFA code is sufficient to permanently disable
  // MFA on the account — see docs/reviews/0001-module-1-architecture-review.md §6.
  currentPassword: string;
}

// --- Privacy controls (Module 15, task #342) ------------------------------------

/// Re-proves account ownership before permanently deleting the account —
/// same "currentPassword" re-confirmation pattern as MfaDisableRequestDto/
/// ChangePasswordDto, for the same reason: a live access token alone must
/// not be sufficient to trigger an irreversible account action.
export interface DeleteAccountRequestDto {
  currentPassword: string;
}

/// GET /auth/privacy/data-export — a synchronous, self-service export of
/// everything this codebase currently associates with the calling user's
/// own account (profile, sessions, linked OAuth accounts, preferences,
/// audit events). Deliberately NOT the same thing as Module 10's
/// organization-wide ComplianceExportRequest flow (async, admin-triggered,
/// covers audit/org-membership/workflow/integration data across an entire
/// organization) — this is the individual "download my data" self-service
/// right, scoped to exactly one account, returned inline rather than
/// queued, since a single account's footprint is small.
export interface UserDataExportDto {
  exportedAt: string;
  account: {
    id: string;
    email: string;
    displayName: string;
    emailVerified: boolean;
    status: string;
    createdAt: string;
  };
  preferences: Record<string, unknown> | null;
  sessions: Array<{
    id: string;
    deviceName: string;
    ipAddress: string;
    userAgent: string;
    createdAt: string;
    lastActiveAt: string;
  }>;
  linkedOAuthAccounts: Array<{ provider: string; linkedAt: string }>;
  recentAuditEvents: Array<{
    type: string;
    ipAddress: string;
    userAgent: string;
    createdAt: string;
  }>;
}

// --- Sessions / devices --------------------------------------------------------

export interface SessionSummaryDto {
  id: string;
  deviceName: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  lastActiveAt: string;
  current: boolean;
}

export interface RevokeSessionRequestDto {
  sessionId: string;
}

// --- Errors ----------------------------------------------------------------------
// Moved to errors.ts and broadened to AppErrorCode (Module 2) — re-exported
// here under the old name so no Module 1 import site needs to change.

export type { AppErrorResponseDto as AuthErrorResponseDto, AppErrorCode as AuthErrorCode } from "./errors.js";
