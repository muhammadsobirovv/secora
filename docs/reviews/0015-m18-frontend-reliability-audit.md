# Module 18 — Frontend Reliability Audit

Task #525 (Phase 23). A pass over `apps/web`'s failure-handling surfaces:
error boundaries, data-fetching retry behavior, and the four hand-rolled
SSE consumers (the browser's native `EventSource` can't attach the Bearer
JWT these streams require, so all four read `fetch()`'s `ReadableStream`
manually — see each hook's own doc comment).

## What was already solid

- **Error boundaries**: `app/error.tsx` (every route under `app/`),
  `app/(dashboard)/error.tsx` (dashboard-specific), and
  `app/global-error.tsx` (catches failures in the root layout itself,
  where `app/error.tsx` can't help since it renders inside that layout).
  All three predate this phase (Module 15 task #354) and were reviewed,
  not rebuilt.
- **React Query defaults** (`app/providers.tsx`): `staleTime: 30_000`,
  `retry: 1` for queries. Mutations correctly do **not** auto-retry
  (React Query's own default) — retrying a POST/PUT automatically risks
  duplicate side effects, so the absence of mutation retry is a correct
  default, not a gap.
- **Per-mutation error surfacing**: grepped for `onError`/`toast.error`
  usage — 20+ files across pages and feature components each handle their
  own mutation failures with a toast, backed by a shared
  `lib/api/error.ts` message-extraction helper. Not centralized, but
  consistently applied; no dead-end mutation found that silently swallows
  a failure.
- **Token refresh**: `lib/api/client.ts`'s `refreshAccessToken()` already
  coalesces concurrent 401s into a single in-flight refresh call rather
  than a stampede of parallel refresh requests.
- **`react-markdown` without `rehype-raw`**: noted in the Phase 22
  dependency audit, but also a reliability property worth restating here
  — a malformed or hostile chunk of Markdown (from an AI response or
  imported content) can't inject raw HTML that breaks the surrounding
  page.

## Gap found and fixed: no SSE auto-reconnect

`useReconJobLogs` (`features/recon/hooks/use-recon.ts`) and
`useVulnScanJobLogs` (`features/vuln/hooks/use-vuln.ts`) both read a live
job-log stream via manual `fetch()` + `ReadableStream`. Before this
phase, a dropped connection — a network blip, or the exact
no-heartbeat-during-quiet-polling gap this project's own Module 18 Phase
15 already disclosed on the backend side (see `recon-jobs.controller.ts`'s
`streamLogs()` doc comment) causing an idle-timing intermediary proxy to
kill the connection — left `connected: false` and `error` set
permanently. Nothing tried again: a still-running job's live log view
would silently stop updating until the user manually navigated away and
back to remount the hook.

Fixed in both hooks: a bounded exponential-backoff auto-reconnect (5
attempts, 1s/2s/4s/8s/16s, reset on a successful reconnect) wraps the
existing stream-read logic. The server's normal terminal-state close
(the job finished — see `streamLogs()`'s existing terminal-event
behavior) is reached via the loop's `break`, not the `catch` block, so it
is correctly never treated as a connection to retry.

## Gap found and deliberately NOT fixed this phase: same issue in AI chat and agent orchestration streams

`use-ai.ts` and `use-agent.ts` read their SSE streams with the identical
`fetch()` + `ReadableStream` pattern and have the identical no-reconnect
gap. This phase does not apply the same fix there, for a specific reason:
`useReconJobLogs`/`useVulnScanJobLogs` accumulate a simple append-only log
array with no mid-message state, so "reconnect and keep appending" is
unambiguously correct. The AI chat and agent orchestration streams carry
partially-streamed, in-progress content (a message being generated
token-by-token, or an orchestration run's live status) — a naive
reconnect there risks duplicating a partial message, resuming into the
wrong point in an in-progress generation, or otherwise corrupting
state in a way that cannot be verified without a running browser and a
live backend in this sandbox. Applying an untested fix to a
higher-stakes, harder-to-verify surface would risk a worse regression
than the gap it closes. This is recorded here as a disclosed, deliberate
deferral — tracked for Phase 29's consolidated documentation — not a
gap silently left undocumented.

## Verdict

Two real reliability gaps found and fixed with a low-risk, well-scoped
change; one structurally similar gap found and explicitly deferred with
reasoning recorded, rather than fixed blind.
