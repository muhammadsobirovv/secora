// Auth module API contracts shared between apps/api and apps/web.
// Keep in sync with apps/api/prisma/schema.prisma — see docs/modules/01-auth.md.

export type OAuthProvider = "GOOGLE" | "GITHUB";

// --- Registration & login -------------------------------------------------

export interface RegisterRequestDto {
  email: string;
  password: string;
  displayName: string;
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
