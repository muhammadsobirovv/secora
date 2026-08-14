import { ApiError } from "./client";

/// Module 15 — task #354 (Consistent error handling system). Backend
/// `AppException` messages (see `apps/api/src/common/exceptions/app.exception.ts`
/// and its ~150+ call sites across every module) are already written to
/// be shown directly to a user — e.g. "This is a demo workspace with
/// sample data only — new scans are disabled." A lot of existing catch
/// blocks across `apps/web` discard that real message in favor of a
/// hardcoded generic string, which means the same failure can read
/// differently depending which screen it happened on. This helper is the
/// one, shared way to surface it correctly going forward: known `ApiError`
/// → use the server's own message (it's meant to be read); anything else
/// (a network failure, a JS exception, an unexpected shape) → the
/// caller's fallback, since those messages are not written for end users.
///
/// Deliberately not retrofitted across every existing `catch` block in
/// this codebase — that would mean editing dozens of already-shipped
/// feature files outside this task's scope (see the standing "no
/// rewriting previous modules" rule). New code, and any file touched for
/// other reasons, should prefer this over a bare `toast.error("...")`.
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message || fallback;
  }
  return fallback;
}

/// Appends `(ref: <requestId>)` when the error carries one, so a toast or
/// error card can show something a support agent can grep server logs
/// for — without every call site needing to know about `requestId` itself.
export function getApiErrorMessageWithRef(error: unknown, fallback: string): string {
  const message = getApiErrorMessage(error, fallback);
  if (error instanceof ApiError && error.requestId) {
    return `${message} (ref: ${error.requestId})`;
  }
  return message;
}
