# Module 15 UX Audit

Static review of every new user-facing surface Module 15 added, checked
against this codebase's existing conventions (loading skeletons, empty
states, toast success/error feedback, React Query cache invalidation
after mutations) rather than against a formal usability test — no
running instance was available in this sandbox to click through.

## Pages reviewed

**Settings → Diagnostics** (`app/(dashboard)/settings/diagnostics/page.tsx`,
task #353) — auto-runs on mount, "Run again"/"Copy report" actions,
per-check pass/fail rows with color-coded badges, a link into Support
that explains the diagnostics-attachment shortcut. **One gap found and
fixed this pass**: between mount and the first run completing, the card
rendered with no content and no loading indicator (only the header
button's spin icon hinted anything was happening) — added a "Running
diagnostics…" placeholder for that window.

**Settings → Support** (`app/(dashboard)/settings/support/page.tsx`,
task #355) — form validation matches the backend DTO's constraints
exactly (min/max length on subject/message), pre-fills email from the
logged-in user but stays editable, success toast + form reset + ticket
list auto-refresh (`useCreateSupportTicket`'s `onSuccess` invalidates the
`["support-tickets","mine"]` query — confirmed present), loading skeleton
and an explicit "No support requests yet" empty state on the ticket
list. **No gap found.**

**Error boundaries** (`app/error.tsx`, `app/(dashboard)/error.tsx`,
`app/global-error.tsx`, task #354) — each surfaces `getApiErrorMessageWithRef()`
(includes the request-correlation ID so a user can quote it to support)
and a "Try again" reset action; `global-error.tsx` renders its own
minimal inline-styled shell since it replaces the root layout entirely on
a layout-level crash, correctly not depending on any component that
might itself be the cause of the crash. **No gap found.**

**Demo mode** (task #352, not touched this session but re-confirmed in
scope) — isolated, clearly labeled, session-based. Not re-audited in
depth this pass since no code changed in it this session.

## Gaps carried forward, not built this pass

- **No Billing UI** (`/billing`, `/pricing`, `/settings/billing` — task
  #332, still pending). `SubscriptionDto`/`PlanDto`/`InvoiceDto` and
  their endpoints are fully usable from any client today; nobody sees a
  page for them yet. This is the single largest end-user-facing gap left
  in Module 15.
- **No Feature Flags admin UI** (task #357's own disclosed scope
  decision) — the two management endpoints exist and work, reachable via
  Swagger/`curl` only.
- **No release-channel indicator in the UI** — `RELEASE_CHANNEL` is
  surfaced on the liveness API response but nothing in `apps/web` reads
  or displays it (e.g., a small "beta" badge). Low priority — this field
  exists primarily for operator/monitoring consumption, not end users.

## Summary

One real, fixed finding (diagnostics page's missing initial-load state).
Everything else newly built this module already follows the codebase's
established loading/empty/error-state conventions correctly. The
substantive remaining UX gap is the missing Billing UI, already tracked
as its own task (#332) rather than something this audit should silently
paper over.
