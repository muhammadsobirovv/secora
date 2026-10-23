import { ApiError } from "@/lib/api/client";
import type { MessageKey } from "@/features/i18n/catalog";

/// Client-engagement errors with their own translated message, so the user
/// reads them in their language instead of the server's English text.
const ROE_ERROR_KEYS: Record<string, MessageKey> = {
  ROE_INVALID_REQUEST: "roe.apiError.INVALID_REQUEST",
  ROE_IP_NOT_SUPPORTED: "roe.apiError.IP_NOT_SUPPORTED",
  ROE_EMAIL_DOMAIN_MISMATCH: "roe.apiError.EMAIL_DOMAIN_MISMATCH",
  ROE_EMAIL_BLOCKED: "roe.apiError.EMAIL_BLOCKED",
  ROE_TOO_MANY_PENDING: "roe.apiError.TOO_MANY_PENDING",
  ROE_RATE_LIMITED: "roe.apiError.RATE_LIMITED",
  ROE_RESEND_COOLDOWN: "roe.apiError.RESEND_COOLDOWN",
  ROE_NOT_FOUND: "roe.apiError.NOT_FOUND",
  ROE_NOT_PENDING: "roe.apiError.NOT_PENDING",
  ROE_INVALID_EVIDENCE: "roe.apiError.INVALID_EVIDENCE",
  ROE_EMAIL_FAILED: "roe.apiError.EMAIL_FAILED",
  ROE_LINK_INVALID: "roe.public.invalid",
};

export function roeErrorKey(error: unknown): MessageKey {
  return (error instanceof ApiError && ROE_ERROR_KEYS[error.code]) || "roe.apiError.generic";
}
