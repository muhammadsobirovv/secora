# First-Run Onboarding — Architecture

Module 15, task #351.

## What already exists

Registration is not a blank-slate event. `RegisterUseCase`
(`apps/api/src/modules/auth/use-cases/register.use-case.ts`) already, in
one transaction: creates the `User`, creates a personal `Workspace`
(`"${displayName}'s Workspace"`) with the user as `OWNER`, and creates a
default `UserPreferences` row. So a new user always lands with exactly
one workspace and zero projects — never a fully empty account, and never
missing a workspace to onboard *into*. This flow's job is narrower than
"set up an account": orient a user who already has a home base toward
their first meaningful action.

## Signal: `UserPreferences.onboardingCompletedAt`

A single nullable timestamp column (`schema.prisma`, `UserPreferences`
model) is the entire state machine — no separate onboarding-progress
table, no per-step tracking. `null` means "show the flow"; a timestamp
means "don't." One direction only: there is no supported "reset
onboarding" action (see the DTO's doc comment on
`UpdateUserPreferencesRequestDto.onboardingCompleted` in
`packages/shared/src/user-preferences.ts`) — sending `false` or omitting
the field is a no-op, sending `true` stamps the current server time.

Wire-level boolean → domain-level `Date` translation happens once, at the
command boundary (`UpdatePreferencesHandler.execute`,
`apps/api/src/modules/user-preferences/commands/update-preferences.command.ts`),
not inside the repository — keeps the repository a dumb persistence
layer and keeps "what does completing onboarding mean" in one place.

## Frontend: `apps/web`

`features/onboarding/onboarding-flow.tsx` — a small hand-rolled 4-step
dialog (Welcome → create a project → recon/AI Copilot → find the docs
portal) built on the existing shadcn `Dialog` primitive, not a new
stepper/wizard dependency (none existed; the four steps are static and
don't need form-wizard machinery). Mounted once in `DashboardShell`
(`components/layout/dashboard-shell.tsx`), alongside `CommandPalette`,
so it appears above whichever authenticated route a brand-new user lands
on first — not only the dashboard home page. It self-gates on
`preferences.onboardingCompletedAt === null` and renders nothing once
that's set; "Skip" and "Get started" both call the same
`PATCH /users/me/preferences {onboardingCompleted: true}` mutation.

The step CTAs are honest hooks into features that exist today (project
creation, AI Assistant, the docs portal from task #350) — no reference to
Demo Mode (task #352), which doesn't have an implementation yet as of
this task; adding a "try demo data" step before that mode exists would
be a dead button. task #352 is expected to extend this flow with its own
step once the demo environment lands, not the other way around.

## Known gaps (tracked, not silently dropped)

- **`apps/desktop` and `apps/mobile` have no onboarding flow of their
  own.** This task shipped one real, working reference implementation
  (web) rather than three shallow ones, matching the scope pattern used
  by tasks #348/#349. Both surfaces already read `UserPreferences` via
  their own settings screens, so the same `onboardingCompletedAt` signal
  is available to them without any further backend work — a follow-up
  only needs a desktop/mobile-side UI.
- **No analytics on step-by-step drop-off.** The flow either completes or
  doesn't; there's no per-step event recording which step a user was on
  when they skipped. Task #347's telemetry framework could be extended to
  cover this if it becomes a real product question.
- **No jest run to verify `update-preferences.command.spec.ts` in this
  sandbox** — see task #351's completion notes for the exact reason
  (the `jest` package itself is absent from the local pnpm store, not
  just corrupted) and what was done instead (full manual trace of the
  handler logic against each test case, plus a clean `tsc --noEmit`
  pass covering the spec file).
