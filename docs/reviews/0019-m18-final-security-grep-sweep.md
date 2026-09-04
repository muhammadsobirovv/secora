# Module 18 — Final Dedicated Security Audit (Grep Sweep)

Task #530 (Phase 28). A last, broad pattern-based sweep across
`apps/api/src` and `apps/web` for the classic dangerous-pattern families
that every prior module-specific security review (M15's dedicated pass,
M16's #434, M17's #492, this module's own Phases 6/10/11/12/13/16/17/21)
already covered surface-by-surface — this phase's job is to check the
same families one more time across the *whole* codebase at once, as a
final net rather than a new investigation.

## Patterns checked and results

- **Command injection** (`eval`, `new Function`, `child_process.exec`/
  `execSync` with string interpolation, `shell: true`): the two real
  process-spawning call sites (`recon/tool-runners/process/spawn-tool-process.util.ts`,
  `vuln/scanner-runners/process/spawn-scanner-process.util.ts`) both use
  `spawn(command, args, ...)` with an argument array, never a shell
  string — confirmed by direct read, not just the grep hit. No `eval`/
  `new Function` anywhere in `apps/api/src` or `apps/web`.
- **SQL injection**: zero uses of `$queryRawUnsafe`/`$executeRawUnsafe`
  anywhere in the codebase — every raw-SQL call site (e.g.
  `WorkerReaperService`'s atomic migration query, now covered by Phase
  27's new test) uses the tagged-template `$queryRaw`/`$executeRaw`,
  which Prisma parameterizes automatically.
- **XSS**: the only `dangerouslySetInnerHTML` in `apps/web` is
  `mermaid-diagram.tsx`, already confirmed safe in Phase 21 (mermaid's
  `securityLevel: "strict"`). No raw `innerHTML =` assignments anywhere.
- **Hardcoded secrets**: grepped for AWS-key-shaped strings, PEM private
  key headers, and `sk-`-prefixed tokens across `apps/api/src` — zero
  matches. A broader `password\s*[:=]\s*["']...["']` sweep matched only
  test-fixture literals in `*.spec.ts` files (expected — login/register
  use-case tests need a literal password to submit).
- **CORS**: `bootstrap.ts`'s `app.enableCors()` sets `origin` to the
  configured `FRONTEND_URL` with `credentials: true` — no wildcard
  `origin: '*'` or bare `cors()` call anywhere.
- **JWT verification**: `jwt.strategy.ts` sets `ignoreExpiration: false`
  explicitly (the safe value) — no `jwt.decode()`-without-verify call
  site found anywhere.
- **Insecure randomness**: every `Math.random()` call site in
  `apps/api/src` is retry-jitter timing (recon/vuln poller and execution
  services) — not used for any token, ID, or secret generation. Actual
  secret/token generation goes through `node:crypto`'s `randomUUID`/
  `randomBytes` throughout (spot-checked in `SyncClient`-adjacent auth
  code during Phase 24, and in `ApiKeyAuthGuard`'s SHA-256 hashing during
  Phase 25 — consistent elsewhere).
- **`@Public()` route audit**: 25 files use the decorator that skips the
  global `JwtAuthGuard`. Spot-checked the ones that looked most
  surprising at a glance — `worker-nodes.controller.ts` and
  `worker-jobs.controller.ts` (Distributed Jobs registration/heartbeat/
  claim/complete/fail) are `@Public()` paired with
  `@UseGuards(ApiKeyAuthGuard)`, i.e. they skip JWT auth specifically
  *because* they require the separate API-key auth guard instead — not
  an accidental bypass. `integrations.controller.ts`'s one `@Public()`
  route is a static read-only capability list with no sensitive data.
  The rest are the expected categories: health/metrics endpoints, OAuth
  callbacks, Stripe/billing webhooks (signature-verified), public share
  links (Module 16's own dedicated security review), and pre-auth flows
  (login, register, password reset, email verification, MFA challenge
  before the second factor). No unexplained `@Public()` route found.
- **Path traversal**: no `path.join()` call site anywhere in
  `apps/api/src` concatenates directly from `req`/`params`/`body` without
  an intermediate validated variable (grepped for the direct pattern
  specifically; this doesn't re-verify every file individually validates
  its path segments, which is what Phase 11's file/storage security audit
  already did in depth).
- **TODO/FIXME/HACK/XXX markers**: zero matches for `// TODO`,
  `// FIXME`, `// HACK`, `// XXX` comment markers anywhere in
  `apps/api/src`. (An earlier broad substring grep for "SECURITY" during
  this sweep matched dozens of files, but all were identifier substrings
  — `SecurityAsset`, `SecurityReportingService`, `security.prompts.ts`,
  etc. — not actual incomplete-work markers; re-run with the precise
  comment-marker pattern to confirm.)

## What this sweep does not replace

This is a pattern-matching pass, not a substitute for the deeper,
logic-level reviews already done phase-by-phase across this module
(SSRF centralization in Phase 12, IDOR sweep in Phase 6, prompt-injection
boundaries in Phase 13, public-sharing token handling in Phase 16, audit
log integrity in Phase 17) or across Modules 15-17's own dedicated
security reviews. A pattern absent from a grep is not proof a class of
bug is impossible — it's evidence that the obvious, mechanically-
detectable form of it isn't present, which is what this specific phase
is scoped to check.

## Verdict

No new finding. Every pattern checked came back clean or resolved to an
already-understood, intentional design (the `@Public()` + `ApiKeyAuthGuard`
pairing being the one that most needed a second look, and checked out).
