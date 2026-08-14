# Demo Mode — Architecture

Module 15, task #352.

## Goal

Let a visitor try the product with zero signup friction — a single
"Try the demo" button that drops them straight into a populated,
fully-navigable dashboard with a real session.

## Entry point: `POST /demo/session`

`apps/api/src/modules/demo/controllers/demo.controller.ts` — `@Public()`
(bypasses the global `JwtAuthGuard`) and `@Throttle({ limit: 5, ttl:
60_000 })` per caller IP. Returns `404 DEMO_MODE_DISABLED` if the
`DEMO_MODE_ENABLED` env flag is off, so operators can ship the code
disabled by default and turn it on deliberately.

## Why an unauthenticated write endpoint is safe here

A public endpoint that creates a `User` + `Workspace` on every call is
normally a request-forgery / resource-exhaustion concern. Two
architectural choices contain that:

1. **Demo workspaces never run anything live.** `DemoSeedService.seed()`
   writes pre-built, already-`COMPLETED` `ReconJob`/`VulnScanJob` rows
   with synthetic findings directly via `PrismaService` — it never goes
   through the normal job-creation command path, so no real network
   scan, AI call, or worker dispatch is ever triggered by a demo
   session.
2. **The read-only guard is enforced at the one shared choke point real
   scans go through.** `resolveTargetForCaller()`
   (`apps/api/src/modules/targets/commands/target-lifecycle.commands.ts`)
   — used by every Target-scoped command — now also returns
   `isDemoWorkspace: boolean`. `CreateReconJobHandler` and
   `CreateVulnScanJobHandler` both check it first and throw
   `AppException('DEMO_WORKSPACE_READ_ONLY', ..., 403)` before touching
   their repositories. A demo visitor can browse and click freely; the
   moment they try to start a new scan they get a clear "sign up for a
   real account" error instead of a scan silently running against
   whatever target they typed in.

`@Throttle` bounds the *rate* of new demo sessions per caller; the two
points above bound the *damage* any single session (or a burst of them)
can do.

## Session issuance

`DemoSessionService.start()` mirrors `RegisterUseCase`'s shape (User +
Workspace + default UserPreferences in one `@Transactional()` unit) with
three deliberate differences: the user has `passwordHash: null` (same
shape as an OAuth-only account — nothing distinguishes it at the schema
level), `emailVerified: true` with no real inbox behind the synthetic
`demo+<uuid>@demo.pentesthub.local` address, and the workspace is marked
`isDemo: true` with a `demoExpiresAt`. It then reuses
`SessionIssuerService.issue()` — the same primitive login, mfa-challenge,
and oauth-exchange already share — so the visitor gets a real,
fully-functional JWT session with no separate demo-only auth code path
to keep in sync. Onboarding (task #351) is marked pre-completed for
demo users rather than shown, since the demo *is* the walkthrough.

## Cleanup: `DemoCleanupService`

Mirrors `McpSessionCleanupService`'s shape exactly: `OnModuleInit` /
`OnModuleDestroy`, a 60s `setInterval`, and
`PollerLeaseService.withLease('demo-cleanup', 90_000, ...)` so only one
node in a multi-instance deployment runs the sweep at a time. Each tick
finds `Workspace` rows where `isDemo: true` and `demoExpiresAt <= now`
and deletes the owning `User` (cascades to the workspace and everything
seeded under it), falling back to deleting the `Workspace` directly if
no owner is found. Per-workspace errors are caught individually so one
bad row doesn't stop the rest of the sweep from running.

## Frontend

`apps/web/features/auth/components/login-form.tsx` — a
"Try the demo — no account needed" button next to the OAuth buttons,
calling `startDemoSession()` (`apps/web/lib/api/auth.ts`, a public
`POST /demo/session`) then completing login exactly like a normal
credential/OAuth login.

`apps/web/features/workspace/components/demo-banner.tsx` — a persistent
strip shown across the dashboard whenever the active workspace has
`isDemo: true`, linking to `/register`, so a visitor is never confused
about whether their changes are being saved to a permanent account.
Mounted once in `DashboardShell`, same pattern as `OnboardingFlow`.

## Known gaps (tracked, not silently dropped)

- **`apps/desktop` and `apps/mobile` have no demo-mode UI.** The API
  endpoint is platform-agnostic, but only the web login screen has a
  "Try the demo" entry point, matching the scope pattern used by
  #348–#351 (one real reference implementation per task rather than
  three shallow ones).
- **No admin visibility into active/expiring demo sessions.** The
  Admin Console (Module 14) has no panel listing current demo
  workspaces or letting an operator force-expire one early; the only
  lever today is `DEMO_SESSION_TTL_HOURS` and the periodic sweep.
- **Per-visitor demo abuse protection is limited to `@Throttle`
  (5/min per caller).** There's no additional fingerprinting, CAPTCHA,
  or global daily cap on demo sessions created. Acceptable for a
  read-mostly synthetic sandbox with no live tool execution, but worth
  revisiting if abuse is observed in production.
- **No jest run to verify the three new spec files in this sandbox**
  (`create-recon-job.command.spec.ts`, `create-vuln-scan-job.command.spec.ts`,
  `demo-session.service.spec.ts`) — the `jest` package itself is absent
  from the local pnpm store in this sandbox (not just corrupted; the
  target directory under `.pnpm/jest@30.4.2.../` does not exist at all).
  Substitute verification: full manual trace of each spec's assertions
  against the real handler/service implementation, plus a clean
  `tsc --noEmit` pass covering all three spec files.
