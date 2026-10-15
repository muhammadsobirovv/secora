# Module 18 — CLI / Desktop / Mobile / SDK Reliability Audit

Task #526 (Phase 24). Continues the Phase 23 frontend reliability audit
into the remaining four client surfaces: the TypeScript SDK
(`packages/sdk-typescript`), the CLI (`packages/cli`), the Desktop Agent
(`apps/desktop/src-tauri`, Rust/Tauri), and the mobile app
(`apps/mobile`, Flutter/Dart). Desktop and Mobile both already have
dedicated offline-support work verified complete earlier in the project
(#175, #261), so this pass is a verification read of their
reliability-relevant code rather than a rebuild — consistent with this
module's proportionate-fix discipline.

## TypeScript SDK (`packages/sdk-typescript`)

Fixed directly (see `http-client.ts`): `HttpClient` previously had no
per-request timeout (a hung connection awaited indefinitely — Node's
`fetch` has no meaningful default) and no retry logic at all. Added a
`timeoutMs` option (default 30s) enforced via `AbortController`, and a
`maxRetries` option (default 2, GET-only, exponential backoff, honors a
capped `Retry-After` on 429) — mutating requests are deliberately never
auto-retried, mirroring the "don't retry non-idempotent requests"
principle already established for `apps/web`'s React Query config.

**Self-correction during this phase**: an earlier version of this same
phase's work wrote a doc comment on `onTokenRefreshed` calling it
"unwired dead code." That was wrong. Tracing `client.ts` shows
`SecoraClient`'s constructor *does* wire it — it's passed into
`AuthResource` as the `onLoginSuccess` callback, which fires on both
`auth.login()` and `auth.refresh()`. The comment has been corrected in
place. The real, narrower gap: there is no *automatic* refresh-on-401
anywhere in this SDK. `auth.refresh()` only runs when a consumer calls it
explicitly — no interceptor in `request()` catches a 401 and retries
after refreshing, unlike `apps/web`'s `client.ts` (Phase 23 audit) or
the mobile app's `ApiClient` (see below, and note the irony: mobile's
pattern is more complete than the SDK's). Porting that logic into the
SDK is a real feature addition, not a mechanical fix, and is recorded
here rather than attempted blind.

## CLI (`packages/cli`)

Confirmed `http.ts`'s `buildHttpClient()` constructs the SDK's
`HttpClient` directly (not `SecoraClient` — the CLI talks to Module
13 surfaces `SecoraClient`'s five resource wrappers don't cover), so
every CLI command **automatically inherits** the timeout/retry fix above
with no CLI-side change needed.

**Fixed**: `commands/version.ts`'s `updateCommand()` does its own direct
`fetch()` against the npm registry (it doesn't go through `HttpClient`
at all — it's not a Secora AI API call) and had the identical
no-timeout gap the SDK fix above addresses. Added the same
`AbortController`-based 10s timeout directly in that command.

**Found and disclosed, not fixed**: `commands/auth.ts`'s `loginCommand()`
saves `result.refreshToken` into `~/.pentesthub/config.json`
(`config.ts`'s `CliConfig.refreshToken` field) — but grepped the whole
CLI package and no command ever reads that field or calls
`AUTH_ENDPOINTS.refresh`. Combined with the CLI using a raw `HttpClient`
(never `AuthResource`, per the point above), `buildHttpClient()`'s
`onTokenRefreshed` callback — which does persist a refreshed token back
to disk — can never fire from within the CLI regardless of the SDK-level
finding above, because nothing in the CLI ever triggers a refresh in the
first place. Net effect: once a CLI-issued access token expires, every
subsequent command fails with a plain 401 `SecoraApiError` (handled
cleanly — see below — but not silently) and the user must run
`pentesthub login` again by hand. This is a real, disclosed UX/reliability
gap, not a crash or data-loss risk; building a real refresh flow into the
CLI is a behavior change this audit phase should not make unverified in
a sandbox with no way to run the CLI against a live backend.

**Verified solid, no changes**: `bin/pentesthub.ts`'s top-level
`main().catch()` already distinguishes `SecoraApiError` (prints
`code`+`message`) from any other thrown error, and sets
`process.exitCode = 1` rather than forcibly calling `process.exit()`
(which would risk truncating buffered stdout) — a correct, complete
top-level error boundary for a CLI. `mcp`/`agents`/`scripts`/etc. command
handlers were spot-checked and consistently propagate errors up to this
same boundary rather than swallowing them.

## Desktop Agent (`apps/desktop/src-tauri`, Rust)

Verification read of `sync/client.rs` and `sync/queue.rs` (the Sync
Engine's HTTP and retry-bookkeeping layers — the surfaces most
analogous to what was just audited/fixed above).

- `SyncClient::new()` already builds its `reqwest::Client` with a 30s
  timeout. `push`/`pull`/`test_connection` all propagate non-2xx
  responses and network errors as a typed `AppError`, which the Sync
  Engine already treats uniformly as "retry later" — including the
  documented case where the `/desktop-sync/*` backend surface itself
  doesn't exist yet (a deliberate, disclosed forward-compatibility
  choice from Module 7, not a bug).
- `RetryQueue::backoff_seconds()` in `queue.rs` implements a bounded
  exponential backoff (5s, 10s, 20s, 40s, 80s, 160s, plateauing at 320s)
  with its own unit test (`backoff_grows_exponentially_and_caps_at_ten_minutes`)
  already covering the plateau behavior.

No gap found. This matches the expectation set by #175 (offline support
already verified complete) — nothing here needed a fix.

## Mobile (`apps/mobile`, Flutter/Dart)

Verification read of `core/network/api_client.dart` and
`core/sync/sync_engine.dart`.

- `ApiClient` already sets both a 15s connect timeout and a 30s receive
  timeout on its `Dio` instance, fails fast with `AppException.offline()`
  when `ConnectivityService` already knows the device is offline (instead
  of letting a doomed request time out the slow way), and — notably more
  complete than the TypeScript SDK's current state — its
  `_AuthInterceptor` already implements automatic, coalesced
  refresh-on-401: concurrent 401s share one in-flight `/auth/refresh`
  call (`_refreshInFlight`, the same pattern as `apps/web`'s
  `refreshPromise`), the original request is retried exactly once with
  the new token, and a failed refresh clears stored tokens and invokes
  `onSessionExpired` to redirect to `/login`. This is the same shape of
  fix the SDK finding above says is missing there — recorded as a
  cross-surface asymmetry for Phase 29, not something to change here.
- `SyncEngine.drain()` already bounds retries per outbox entry
  (`_maxAttempts = 8`), gives up cleanly past that (surfaced via
  `pendingCount`/Settings > Sync rather than silently discarding the
  entry), and is event-triggered (on `enqueue()` and on
  `ConnectivityService.onStatusChange` going online) rather than a tight
  poll, so there's no retry-storm risk from the drain loop itself.

No gap found. This matches the expectation set by #261 (offline-first
mode + sync engine already verified complete) — nothing here needed a
fix.

## Verdict

Two real, low-risk mechanical fixes applied (SDK timeout/retry, CLI
update-check timeout — the latter inheriting most of its benefit from
the former since the CLI's REST calls all route through the same
`HttpClient`). One doc-comment inaccuracy from earlier in this same phase
self-corrected. One disclosed-not-fixed CLI gap (no token-refresh path,
requiring manual re-login on expiry) carried to Phase 29. Desktop and
Mobile's reliability layers were both verified solid on inspection, with
Mobile's auth-refresh interceptor specifically noted as a pattern worth
eventually porting into the SDK — not urgent enough, or safe enough to
verify blind in this sandbox, to attempt in this phase.
