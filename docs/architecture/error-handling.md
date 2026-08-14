# Consistent Error Handling — Architecture

Module 15, task #354.

## What already existed

The backend has had a single, consistent error path since early in this
project: every thrown error — a domain `AppException`, a `class-validator`
validation failure, `@nestjs/throttler`'s rate-limit exception, or an
unexpected crash — passes through one global `HttpExceptionFilter`
(`apps/api/src/common/filters/http-exception.filter.ts`) and comes out in
one shape: `{ statusCode, code, message }` (`ApiErrorResponse`, shared
package). `AppException(code, message, httpStatus)` is the standard way
every module throws a domain error, and `code` is a closed TypeScript
literal union (`AppErrorCode`, `packages/shared/src/errors.ts`) — every
new error code has to be declared there, so the set of possible error
codes is enumerable and typed end-to-end. `apps/web`'s `apiFetch()`
(`lib/api/client.ts`) already turns any non-2xx response into a typed
`ApiError` with that same `code`/`message`/`statusCode`. This task
extends that foundation in three targeted ways rather than rebuilding
it.

## 1. Request ID threading into the error body

Module 14's `requestIdMiddleware` already generates a per-request
correlation id, echoes it as the `X-Request-Id` response header, and
threads it through `AsyncLocalStorage` so `StructuredLoggerService`
tags every log line from that request with it. That id previously
never reached the JSON error body itself — only the header, which
doesn't survive a copy-paste of an error message into a support
ticket. `HttpExceptionFilter.send()` now reads `getRequestId()` and
includes it as `ApiErrorResponse.requestId` (optional — unset for the
rare failure that happens before the middleware runs). `ApiError` on
the frontend carries it through as `error.requestId`.

## 2. `getApiErrorMessage()` / `getApiErrorMessageWithRef()`

`apps/web/lib/api/error.ts`. `AppException` messages are already
written to be read by a user (e.g. "This is a demo workspace with
sample data only — new scans are disabled."), but a lot of existing
`catch` blocks across the frontend discard that real message in favor
of a hardcoded generic string (`toast.error("Couldn't revoke
session.")` regardless of *why* it failed). This is the one shared
helper going forward: a known `ApiError` → show its real message
(optionally suffixed with `(ref: <requestId>)`); anything else
(network failure, unexpected JS exception) → the caller's fallback,
since those messages aren't written for end users.

**Deliberately not retrofitted across every existing catch block** —
that would mean editing dozens of already-shipped feature files for a
cosmetic improvement, which the standing "don't rewrite previous
modules outside integration/bug-fixing" rule doesn't cover. New code,
and anything touched for other reasons, should prefer it.

## 3. React error boundaries (`apps/web`)

Before this task, an uncaught render error anywhere in the app fell
through to Next.js's default unstyled crash screen — there was no
`app/error.tsx` anywhere in the tree. Three files, using Next.js App
Router's built-in convention (zero per-page wiring, applies
retroactively to every existing route):

- `app/error.tsx` — root segment boundary. Styled card, "Try again"
  (`reset()`), "Copy error details" (message + digest + URL, meant for
  a bug report). Deliberately has no dependency on `useAuth`/React
  Query/`useDiagnostics` — an error boundary must render even when the
  crash is inside state those providers depend on.
- `app/(dashboard)/error.tsx` — segment-scoped: a crash inside one
  dashboard page is caught here instead of bubbling up to the root
  boundary, which would otherwise tear down the sidebar/header shell
  along with it. "Try again" or "Back to dashboard."
- `app/global-error.tsx` — catches errors in the root layout itself
  (the one place `app/error.tsx` can't help, since it renders inside
  that same layout). Must render its own `<html>`/`<body>`; kept to
  plain inline styles rather than Tailwind/shadcn, since if the root
  layout is what's broken, the font/CSS pipeline it sets up may be
  exactly what's failing.

## Known gaps (tracked, not silently dropped)

- **No blanket retrofit of `getApiErrorMessage()` across existing
  mutations.** See above — a deliberate scope boundary, not an
  oversight.
- **No global React Query `MutationCache`/`QueryCache` `onError`
  toast.** Considered and rejected: most existing mutations already
  wrap `mutateAsync()` in their own try/catch + `toast.error(...)`
  (see `apps/web/app/(dashboard)/settings/sessions/page.tsx` for a
  representative example). A global cache-level `onError` fires
  independently of that local try/catch in TanStack Query v5, which
  would mean every one of those call sites double-toasts the same
  failure. Fixing that properly requires auditing each call site
  individually — out of scope here; flagged for whoever tackles a
  future "error UX consistency" pass.
- **`apps/desktop` and `apps/mobile` have no equivalent error
  boundaries.** Web-only reference implementation, matching the scope
  pattern used by tasks #348–#353. Tauri/Flutter both have their own
  native crash-handling primitives that would need separate research.
- **No error-code reference page in the docs portal (task #350).**
  `AppErrorCode` has grown to a large closed union across every
  module; a generated reference table (code → typical HTTP status →
  meaning) would be genuinely useful but wasn't built this task —
  worth a follow-up given the docs portal's `generateStaticParams()`
  pattern could bake it at build time from the shared package.
