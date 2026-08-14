# Support System — Architecture

Module 15, task #355.

## Scope decision: no in-app ticket-management admin panel

This codebase has no deployment-wide "platform admin" role — RBAC
(`RolesGuard`, `enterpriseRoleAtLeast`) is scoped to membership *within*
an organization, and Module 14's `ClusterOverviewService` already
discloses the same gap for infrastructure detail. Building an in-app
support-triage queue would mean either introducing that role now (a
larger change than this task) or leaving the queue unprotected. Instead,
this task follows the same posture SECURITY.md already documents for
security reports: a monitored inbox (`SUPPORT_INBOX_EMAIL`, defaults to
`support@pentesthub.ai`) is the primary triage channel. The database
table exists for audit history and the submitter's own "my tickets"
list, not as the operator's working queue.

## `POST /support/tickets` — public intake

`apps/api/src/modules/support/controllers/support.controller.ts`.
`@Public()` and `@Throttle({ limit: 10, ttl: 60_000 })`, mirroring
`POST /demo/session`'s reasoning (task #352): someone locked out of
their account is exactly who most needs to reach support without a
token. `CreateSupportTicketHandler` writes the ticket, emails the
support inbox (ticket contents + optional diagnostics snapshot), and
sends the submitter a plain confirmation email so they know the request
was received even before anyone replies.

## Why `userId` is usually null

`JwtAuthGuard.canActivate()` returns `true` immediately for a
`@Public()` route without running the passport strategy — `req.user` is
never populated (see the guard's own doc comment). Building an
optional-auth mechanism (validate a token if present, don't require one)
would mean new cross-cutting guard infrastructure this codebase doesn't
have. Rather than fake an identity or take on that infrastructure
change, `SupportTicket.userId` is genuinely nullable and usually null;
`GET /support/tickets/mine` (authenticated) matches by the caller's
account **email** instead, which is always present on the ticket since
the intake form requires it (pre-filled from the user's profile when
logged in, editable otherwise).

## Diagnostics integration (task #353)

The support form's "attach diagnostics" checkbox reuses
`useDiagnostics()` directly (`apps/web/features/system/hooks/use-diagnostics.ts`)
rather than re-implementing a separate self-test — the exact same
report shown on Settings → Diagnostics is what gets attached, so a
triager sees app/server version, database status, and round-trip
latency without asking. The Diagnostics page also links to
Settings → Support the other direction, closing the loop the two
tasks' doc comments both said they would.

## Known gaps (tracked, not silently dropped)

- **No in-app admin ticket queue** — the deliberate scope decision
  above, not an oversight.
- **`workspaceId` is always null** — collecting it would mean resolving
  the caller's active workspace, which (like `userId`) isn't reliably
  available on a public, optionally-authenticated route without new
  guard infrastructure. A future authenticated-only "report a problem
  from this workspace" entry point could populate it properly.
- **`npx prisma generate` has not been run in this sandbox** — the
  `prisma` CLI package is absent from the local pnpm store here (same
  category of gap as `jest`, disclosed in tasks #351/#352). The new
  `SupportTicket` Prisma model therefore has no generated client type
  yet; the repository interface defines `SupportTicket` locally
  (matching `schema.prisma` field-for-field) instead of importing it
  from `prisma-types.js`, and the Prisma-backed repository casts its
  return values accordingly. **Running `npx prisma generate` (and a
  migration) on a normal machine is required before this module will
  actually run** — this is the same standing requirement already
  disclosed for every other Module 15 schema change (`Workspace.isDemo`,
  `UserPreferences.onboardingCompletedAt`, etc.) and is tracked by task
  #365's consolidated migration.
- **No jest run to verify the new command/query handlers** — same
  standing sandbox limitation as every prior Module 15 task this
  session. Verified via manual trace against `CreateReconJobHandler`'s
  already-tested shape and a clean `tsc --noEmit` pass.
- **No desktop/mobile support entry point** — web-only reference
  implementation, matching the scope pattern used by tasks #348–#354.
