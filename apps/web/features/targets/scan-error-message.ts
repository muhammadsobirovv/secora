import { ApiError } from "@/lib/api/client";

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

export function scanErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && ACTIONABLE_SCAN_ERRORS.has(error.code) ? error.message : fallback;
}
