import { ApiError } from "@/lib/api/client";
import type { MessageKey, TranslateFn } from "@/features/i18n/catalog";

/// Refusals whose server message tells the user exactly what to fix
/// (authorize the target, renew an expired authorization, or why the
/// target cannot be actively scanned at all).
const ACTIONABLE_SCAN_ERRORS = new Set([
  "TARGET_AUTHORIZATION_REQUIRED",
  "TARGET_AUTHORIZATION_EXPIRED",
  "TARGET_FORBIDDEN_FOR_ACTIVE_SCAN",
  "TARGET_OUT_OF_SCOPE",
  "TARGET_SCOPE_PENDING_REVIEW",
]);

/// Stable error codes with their own translated message. These are shown in
/// the user's language instead of the server's English text.
const TRANSLATED_SCAN_ERRORS: Record<string, MessageKey> = {
  SCAN_RATE_LIMITED: "scan.error.rateLimited",
  SCAN_TARGET_BUSY: "scan.error.targetBusy",
  QUOTA_EXCEEDED: "scan.error.quota",
  SCAN_PROFILE_DISABLED: "scan.error.profileDisabled",
  SCAN_DEEP_CONFIRMATION_REQUIRED: "scan.error.deepConfirm",
  TARGET_OWNERSHIP_NOT_VERIFIED: "scan.error.notVerified",
  OWNERSHIP_CHECK_TOO_SOON: "scan.error.checkTooSoon",
};

/// The catalog key for an error code that has a translated message, if any.
export function scanErrorKey(error: unknown): MessageKey | null {
  return error instanceof ApiError ? (TRANSLATED_SCAN_ERRORS[error.code] ?? null) : null;
}

/// Message to show for a failed scan start. Rate-limit, quota and verification
/// codes are translated (pass `t`); a few other refusals carry a server
/// message that already says what to fix; everything else gets `fallback`.
export function scanErrorMessage(error: unknown, fallback: string, t?: TranslateFn): string {
  const key = scanErrorKey(error);
  if (key && t) return t(key);
  return error instanceof ApiError && ACTIONABLE_SCAN_ERRORS.has(error.code) ? error.message : fallback;
}
