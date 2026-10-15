# Module 1 Architecture Review — Auth Backend

Reviewer stance: Staff Security Engineer / Software Architect, pre-production
launch gate. Scope: `apps/api/src/modules/auth`, `apps/api/src/modules/{audit,rbac,organizations,api-keys,user-preferences}`,
`apps/api/src/common`, `apps/api/prisma/schema.prisma`, and the three test
suites. No code was modified to produce this report; every claim below was
verified against the current source, not recalled from memory (grep/read
evidence cited inline where non-obvious).

**Headline**: no CRITICAL findings — nothing is trivially exploitable with
default config today. There are eight **HIGH** findings, all cheap to fix,
that should be closed before this module is trusted as "production-ready,"
and several of them (transaction gaps, error-handling inconsistency, OAuth
token storage) will get more expensive to fix the longer Module 2+ copies
the same patterns. Recommend a short remediation pass before Module 2,
not a rewrite.

---

## 1. Architecture overview

NestJS modular monolith. Request flow: `Controller → UseCase →
RepositoryInterface (DI token) → Prisma*Repository adapter → Postgres`.
Cross-cutting concerns are global: `ThrottlerGuard → JwtAuthGuard →
RolesGuard` (in that order, via `APP_GUARD`), one global exception filter,
one global response-envelope interceptor, `ClsModule` +
`@nestjs-cls/transactional` for transaction propagation. Six feature
modules (`auth`, `audit`, `rbac`, `organizations`, `api-keys`,
`user-preferences`); `audit`/`prisma`/`common/providers` are `@Global()`,
the rest require explicit import.

This is a reasonable shape for a single-team, single-deployable auth
service. It is not yet a shape that's been proven under concurrent load,
multi-instance deployment, or a second engineer working in parallel (no
CI, as noted in §23).

## 2. Folder structure review

`modules/auth/{controllers,dto,use-cases,services,strategies,mappers,domain/repositories,infrastructure/persistence/prisma}` —
consistent and easy to navigate. `rbac`/`organizations`/`api-keys`/
`user-preferences` mirror the same `domain/infrastructure` split at a
smaller scale, which is consistent but arguably premature ceremony for
modules that are currently one interface + one adapter each (see §23).

- **[LOW] `mappers/` is a directory for one file.** Not wrong, just worth
  collapsing to `mappers.ts` or accepting it'll grow. Fix before Module 2:
  No.
- **[LOW] Three independent Jest configs** (`jest` in package.json,
  `test/jest-e2e.json`, `test/jest-integration.json`) duplicate
  `moduleNameMapper`/`transform`/ESM settings three times. A shared base
  config (or Jest's `projects` feature) would remove the duplication. Fix
  before Module 2: No.

## 3. Dependency graph

`AuthModule` imports `RbacModule`, `OrganizationsModule`,
`UserPreferencesModule` directly (not global) — correct choice, avoids
implicit global coupling, but means every future module that needs RBAC
must import it explicitly too; worth a one-line note in
`docs/modules/01-auth.md` so the next author doesn't rediscover this. No
circular dependencies found.

External dependency risk worth flagging, not fixing:

- **[MEDIUM] `passport-google-oauth20` and `passport-github2` are
  low-activity packages** (years since last meaningful release; they wrap
  the still-maintained `passport-oauth2`). Not a defect today, but worth
  a calendar reminder to re-evaluate before OAuth goes to real production
  traffic — if either strategy needs a security fix upstream, response
  time from maintainers is unknown. Fix before Module 2: No.
- **[INFO] Prisma 7, `@nestjs-cls/transactional`, and the `prisma-client`
  generator are all very recently released** as of this build. Pin exact
  versions (already done via lockfile) and watch changelogs before
  bumping — Prisma 7's driver-adapter model already broke once during
  this build (see ADR D1/D2).

## 4. Clean Architecture compliance

Dependency rule is respected in the direction that matters: use-cases
never import `PrismaClient`/`PrismaService`, only repository interfaces.
Controllers are thin (DTO → use-case → DTO, no branching logic).

- **[MEDIUM] Anemic domain model.** Repository interfaces return
  Prisma-generated types directly (`User`, `Session`, ...) rather than
  independent domain entities. This was a deliberate, documented tradeoff
  (ADR §2: "these are plain data shapes, not a leak of Prisma's query
  API") and it's a defensible one — but it does mean there's no single
  place business invariants live (e.g. "a locked user" is a state
  scattered across `if` checks in `login.use-case.ts` rather than a
  `User.isLocked()` method). Acceptable for the current size; revisit if
  business rules keep multiplying across use-cases. Fix before Module 2:
  No.
- **[LOW] Use-cases are NestJS-decorated (`@Injectable`, `@Inject`),** not
  framework-agnostic. Standard, pragmatic NestJS pattern, not a "pure"
  Clean Architecture use-case layer. Not worth fighting the framework
  over. Fix before Module 2: No.

## 5. SOLID compliance

DIP and ISP are the strongest marks here — every repository interface is
narrow and purpose-built (`recordFailedLogin`, `findValidByHash`, not
generic `update(where, data)`), and use-cases depend only on those
interfaces.

- **[LOW] `MfaRepository` bundles three aggregates** (`MfaFactor` +
  `MfaBackupCode` + `MfaChallengeToken`) behind one 10-method interface —
  a deliberate "one aggregate: a user's MFA configuration" call (ADR §2),
  but it's the widest interface in the codebase and mixes three different
  lifecycles (factor setup, backup-code consumption, challenge-token
  expiry). Not urgent to split, but if a fourth MFA-adjacent concern
  shows up, split then. Fix before Module 2: No.

## 6. Security review (OWASP ASVS)

The highest-value section. Findings ordered by severity.

- **[HIGH] No OAuth `state` parameter / CSRF protection on the OAuth
  flow.** Verified: neither `GoogleStrategy` nor `GithubStrategy` sets
  `state: true` or provides a state store. `passport-oauth2`-based
  strategies do not add CSRF state protection by default without explicit
  configuration. Without it, an attacker can craft a malicious OAuth
  callback link that links *the attacker's* provider account to *the
  victim's* Secora session, or otherwise manipulate the callback flow.
  **Solution:** enable `state: true` on both strategies with a stateless
  store (e.g. a signed nonce in the redirect, verified in the callback) —
  cheap, no architecture change. **Fix before Module 2: Yes** (before any
  real OAuth credentials are wired up, which could happen at any time).

- **[HIGH] Third-party OAuth tokens stored in plaintext, and unused.**
  Verified: `OAuthAccount.accessToken`/`refreshToken` are plain `String?`
  columns, written in `oauth-login.use-case.ts` and read nowhere else in
  the codebase. Every other bearer credential in this schema is hashed at
  rest (refresh tokens, verification tokens, reset tokens, MFA backup
  codes) — these two columns are the one exception, and they're not even
  used for anything. If the DB leaks, these tokens could grant an
  attacker access to the user's actual Google/GitHub account (scope-
  dependent). **Solution:** stop storing them (simplest — they're dead
  weight) unless there's a concrete near-term plan to call Google/GitHub
  APIs on the user's behalf, in which case encrypt at rest with an
  application-level key, not plaintext. **Fix before Module 2: Yes** —
  it's a one-line change (drop two fields from the `create()` call) with
  zero functional cost today.

- **[HIGH] Transaction gaps on security-sensitive multi-write flows.**
  Verified: only `register` and `oauth-login` use `@Transactional()`.
  `reset-password` (10 repository calls), `change-password` (8),
  `mfa-confirm` (4), `logout` (5), and `revoke-session` (5) are not
  wrapped. The worst case: `reset-password` updates the password hash,
  *then* revokes sessions/refresh tokens as separate, non-atomic writes —
  if the process crashes or the DB connection drops between those steps,
  the account ends up with a **new password but old sessions still
  live**, silently defeating the entire point of that revocation step.
  `mfa-confirm` has a similar gap: if it crashes between `confirmFactor`
  and `replaceBackupCodes`, MFA ends up "enabled" with zero backup codes.
  **Solution:** add `@Transactional()` to all five use-cases — the
  infrastructure already exists, this is purely decorator application.
  **Fix before Module 2: Yes.** This is the single highest-value fix in
  this report: cheap, mechanical, and closes a real security-relevant
  consistency gap before more use-cases are written that could copy the
  same non-transactional pattern.

- **[HIGH] Rate limiting is per-instance, not global.** `ThrottlerModule`
  uses in-memory storage (a documented, deliberate decision — ADR §1).
  This is fine for one instance. The moment this app runs behind a load
  balancer with more than one instance — which is explicitly the stated
  scaling goal ("must be scalable enough to support millions of users") —
  the effective rate limit multiplies by instance count, since each
  instance tracks its own counters. **Solution:** swap `ThrottlerStorage`
  for a Redis-backed implementation before any multi-instance deployment
  (the interface is already designed to make this a config change, not a
  rewrite). **Fix before Module 2: No** (Module 2 doesn't require
  multi-instance deployment), but flag it as a hard blocker before
  *production* deployment, and don't let it get forgotten.

- **[HIGH] `req.ip` is wrong behind any reverse proxy/load balancer.**
  Verified: no `app.set('trust proxy', ...)` anywhere in `bootstrap.ts`
  or `main.ts`. In any real deployment (nginx, ALB, Cloudflare, ...),
  every audit-logged IP address and every throttle-guard IP-based counter
  will see the proxy's IP, not the real client's — this breaks both the
  audit trail's evidentiary value and the effectiveness of IP-based rate
  limiting simultaneously. **Solution:** configure `trust proxy`
  appropriately for the deployment topology (exact hop count, not a blind
  `true`, to avoid trusting spoofable `X-Forwarded-For` values from the
  client). **Fix before Module 2: No**, but document the requirement
  loudly so it isn't discovered during an incident.

- **[MEDIUM-HIGH] Account lockout is a self-service DoS vector.** Any
  unauthenticated caller who knows a victim's email can lock that
  account by sending 5 wrong passwords — no CAPTCHA, no notification to
  the victim, no distinction between "attacker probing" and "legitimate
  user who forgot their password." **Solution:** at minimum, send a
  notification email on lockout (cheap, `MailService` already exists);
  consider CAPTCHA after N failures or exponential per-account backoff
  instead of a hard lock for a future iteration. **Fix before Module 2:
  Recommended** for the notification piece; the CAPTCHA piece can wait.

- **[MEDIUM] `rememberMe` is silently broken across refresh rotation.**
  Already documented as a known limitation in the ADR, but worth
  elevating here: a user who checks "remember me" (expecting a 30-day
  session) will be logged out after 7 days once their token rotates —
  which happens well within a day of normal use, since every refresh
  rotates. This is a shipped, user-visible broken promise, not a
  theoretical gap. **Solution:** persist the `rememberMe`/extended-TTL
  choice on the `Session` row so rotation can read and preserve it.
  **Fix before Module 2: Recommended** — it's a real feature defect, not
  hardening.

- **[MEDIUM] MFA can be disabled without re-confirming the password.**
  A valid access token + a valid TOTP/backup code is sufficient — if an
  attacker has a live (stolen) session and, separately, gets one MFA
  code (e.g. via a narrow phishing window), they can permanently disable
  MFA on the account. Many providers require password re-entry for
  security-sensitive actions like this. **Solution:** require
  `currentPassword` in the MFA-disable request, same pattern as
  `change-password`. **Fix before Module 2: Recommended.**

- **[MEDIUM] No password breach-list check** (e.g. HaveIBeenPwned's
  k-anonymity API) and no security-notification emails on sensitive
  events (password changed, MFA disabled, new device, refresh-reuse
  detected). All of `MailService`/`AuditService` needed for this already
  exist. **Fix before Module 2: No**, good near-term follow-up.

- **[MEDIUM] No security-header middleware** (`helmet` or equivalent) —
  no `Strict-Transport-Security`, `X-Content-Type-Options`,
  `X-Frame-Options`, CSP. Ten-minute fix, zero architectural impact.
  **Fix before Module 2: Recommended**, purely because it's this cheap.

- **[INFO] Password policy is length-only (8–128 chars), no complexity
  rules.** This matches current NIST 800-63B guidance (length over
  imposed complexity) — stating this explicitly so it reads as an
  intentional stance if a future auditor asks, not an oversight.

- **[INFO] No CSRF token mechanism.** Correctly not needed — this API is
  bearer-token-in-header only, no cookie-based session, so CSRF's
  precondition (browser auto-attaching credentials) doesn't apply. Would
  need revisiting only if tokens are ever moved into cookies.

## 7. Performance review

- **[MEDIUM] Every authenticated request does a DB round-trip**
  (`JwtStrategy.validate` calls `usersRepository.findById` every time) to
  catch suspension/lock within the token's 15-minute TTL — an intentional
  tradeoff (ADR §7), correctly reasoned, but worth flagging as the first
  thing to cache (short-TTL in-process or Redis) once request volume
  matters. Fix before Module 2: No.
- **[LOW] No Prisma/pg connection pool tuning** — `PrismaPg` is
  constructed with only `connectionString`, no explicit pool size/idle
  timeout. Fine at current scale; revisit under real load testing. Fix
  before Module 2: No.
- **[INFO] Argon2id's default cost parameters** favor security over
  throughput, which is the right default — just worth monitoring p99
  login latency once there's real traffic, since hashing cost is by
  design the dominant cost of a login request.
- **[GOOD] Role names are resolved once at login/refresh and embedded in
  the JWT** rather than queried per-request — this is already the
  correct optimization; no action needed.

## 8. Database schema review

- **[MEDIUM] `User.status = DELETED` has no accompanying `deletedAt`
  timestamp or actual purge logic.** The lifecycle semantics of a
  "deleted" user are undefined — is data retained indefinitely, purged
  after N days, purged immediately? There is no account-deletion flow yet
  to exercise this, so it's latent, but worth deciding before one is
  built. Fix before Module 2: No.
- **[LOW] `Organization.slug` generation has no collision-retry logic.**
  Collision probability is astronomically low (6 hex chars of randomness
  on top of a slugified name), but if it ever did collide, the caller
  gets a raw, uncaught Prisma unique-constraint error instead of a clean
  `AppException`. Same class of issue as the register-email race below —
  worth fixing in the same pass. Fix before Module 2: No (low probability,
  but see §22 for the same pattern at higher probability).
- **[LOW] Inconsistent `updatedAt` coverage** — present on `User`,
  `Organization`, `UserPreferences`; absent on `Session`, `RefreshToken`,
  `MfaFactor` (has `confirmedAt` instead), verification/reset tokens.
  Mostly append-only/immutable rows, so low practical impact, just an
  inconsistency. Fix before Module 2: No.
- **[GOOD] UUID primary keys throughout** (non-sequential, unguessable) —
  correct choice for a system exposed to enumeration risk.
- **[GOOD] `AuditEvent.userId` is nullable with `onDelete: SetNull`** —
  audit history correctly survives account deletion. Already documented
  in the ADR as intentional.

## 9. Prisma migration review

- **[HIGH — but scoped to "before real deployment," not Module 2] No
  migration history exists** (`apps/api/prisma/migrations/` is absent).
  Schema sync happens via `prisma db push`, which is correct and
  necessary for this environment's pglite-backed dev server (documented
  in ADR D8 — `migrate dev` doesn't work against it) but is **not** a
  workflow that should reach a real Postgres target. Without migration
  history there's no reviewable, rollback-able, repeatable schema change
  process. **Solution:** the moment a real Postgres environment
  (staging/prod) is provisioned, run `prisma migrate dev` against it once
  to generate a baseline migration, then use `migrate deploy` for every
  change after. **Fix before Module 2: No** (Module 2 can keep developing
  locally against `db push`), but don't let schema changes pile up
  indefinitely without migration history — the longer this waits, the
  more painful the first "real" migration will be to reconstruct.

## 10. API review

- **[MEDIUM] No API versioning strategy** (no `/v1/` prefix or header-
  based versioning). Not urgent with one client-less API today, but
  retrofitting versioning after multiple modules and multiple client
  platforms (web/mobile/desktop, per the master spec) exist is
  meaningfully more expensive than establishing the convention now.
  **Fix before Module 2: Recommended** — cheap now, expensive later.
- **[LOW] No pagination convention established.** `GET /auth/sessions`
  returns everything unpaginated, which is fine (bounded by device
  count), but no shared pagination DTO/pattern exists for future list
  endpoints (Recon results, CVE search, etc. — all Module 2+ concerns
  that will want this). Worth establishing the pattern now while it's
  low-stakes. Fix before Module 2: Recommended, if convenient.
- **[GOOD] Consistent response envelope, correct HTTP status code usage**
  (201/204/401/403/409/429 all used appropriately), Swagger coverage
  complete for all public routes with OAuth redirects correctly excluded.

## 11. Repository pattern review

Already covered in depth under §4/§5. One addition:

- **[LOW] `OAuthAccountsRepository` has no delete/revoke method** — there
  is no way to unlink a provider at the repository level, matching the
  fact that no unlink feature exists yet. Not a gap today, just noting
  the repository will need extending when that feature is built. Fix
  before Module 2: No.

## 12. Transaction review

Covered as the top HIGH finding in §6. Restating the scope precisely for
this section: **5 of 7 multi-write use-cases are non-transactional**
(`reset-password`, `change-password`, `mfa-confirm`, `logout`,
`revoke-session`); only `register` and `oauth-login` (the two flows
originally planned as "atomic" in the pre-implementation plan) got the
decorator. This wasn't a considered decision for the other five — it's an
oversight from treating `@Transactional()` as something only the
originally-planned flows needed, rather than a property every multi-write
use-case should have by default. **Fix before Module 2: Yes** (see §6 for
the full writeup).

## 13. Error handling review

- **[MEDIUM] Inconsistent exception usage contradicts the documented
  design rule.** `AppException`'s own doc comment states "every use-case
  throws this (never a raw NestJS HttpException)" — but `get-current-
  user`, `revoke-session`, and `mfa-setup` throw `NotFoundException`
  directly. The global filter handles this gracefully (still a clean
  JSON error shape), but the `code` field comes back as generic
  `"HTTP_ERROR"` instead of a specific `AuthErrorCode`, which is less
  useful for frontend branching and breaks the stated contract.
  **Solution:** either throw `AppException` consistently everywhere, or
  update the documented rule to explicitly allow `NotFoundException` for
  "resource doesn't exist / isn't yours" cases and add a dedicated
  `RESOURCE_NOT_FOUND` code so the shape stays predictable either way.
  **Fix before Module 2: Recommended** — cheap now, and Module 2's
  use-cases will otherwise copy whichever pattern they see first.
- **[GOOD] The global filter's handling of unknown errors is correct** —
  logs the real error server-side, returns a generic "Internal server
  error" to the client with no stack trace or internal detail leakage.

## 14. Logging review

- **[MEDIUM] No structured (JSON) logging.** NestJS's default
  console `Logger` is fine for local dev, not for production log
  aggregation (no machine-parseable fields, no log levels usable by a
  collector). **Solution:** swap in `pino` or `winston` with a NestJS
  adapter before real deployment. Fix before Module 2: No.
- **[LOW] No request-correlation ID.** `ClsService`/`AsyncLocalStorage`
  is already wired up for transactions — extending it to carry a request
  ID and including it in every log line would be low-effort given the
  infrastructure that already exists. Fix before Module 2: No, good
  near-term follow-up.
- **[LOW] No access logging middleware** (method/path/status/duration
  per request) — useful for ops visibility, not present. Fix before
  Module 2: No.

## 15. Audit review

- **[GOOD] Strong coverage of security-relevant events** — login
  success/failure, lockout, password reset/change, MFA enable/disable/
  challenge success+failure, refresh rotation/reuse, OAuth login/link,
  session revocation. This is genuinely one of the stronger parts of the
  implementation.
- **[Cross-reference to §6]** Audit `ipAddress` will be wrong in any
  proxied deployment until `trust proxy` is configured — directly
  undermines the audit trail's usefulness for incident investigation.
  Same finding, different lens; not double-counting severity.
- **[LOW] No retention/archival policy** — `AuditEvent` grows unbounded.
  Not urgent at current scale; see §24.
- **[LOW] No audit read/query API** — expected, that's an Admin Panel
  (future module) concern, not a Module 1 gap.

## 16. Authentication review

Core mechanics (argon2id, generic invalid-credentials error to prevent
login-endpoint enumeration, per-account lockout, JWT + refresh rotation)
are solid and OWASP-aligned. Specific gaps already covered in §6:
no breach-password check, lockout-as-DoS, rememberMe not preserved
through rotation. One addition:

- **[GOOD] `POST /auth/register` is the one place enumeration is
  intentionally accepted** (`409 EMAIL_ALREADY_REGISTERED`) — this is a
  defensible, common UX tradeoff (vs. `forgot-password`, which correctly
  never reveals whether an email exists). Worth a one-line comment in the
  code noting this is a deliberate inconsistency, not an oversight, so a
  future security review doesn't re-flag it without context.

## 17. OAuth review

The two HIGH findings (`state` parameter, plaintext token storage) are
covered in full in §6. One additional item:

- **[MEDIUM] Silent auto-linking with no user notification.** When
  `OAuthLoginUseCase` finds an existing user by email match (not by
  provider-account match), it links the new OAuth identity automatically
  with no confirmation step and no notification email. Provider-verified
  email makes this a generally-accepted pattern, but a "new sign-in
  method was added to your account" email is cheap insurance against the
  (low-probability) scenario where this auto-link is exploited. Fix
  before Module 2: No, good near-term follow-up alongside the other
  notification gaps in §6.

## 18. MFA review

- **[MEDIUM] Inconsistent throttling across MFA endpoints.** Verified:
  only `/auth/mfa/challenge` has `@Throttle({limit:5,ttl:60000})`;
  `/auth/mfa/setup`, `/auth/mfa/confirm`, and `/auth/mfa/disable` fall
  back to the global 100-req/60s default. `confirm` and `disable` are
  both "guess a code against an authenticated session" endpoints — the
  same threat model as `challenge` — and should carry the same tight
  limit for consistency and defense-in-depth (practical exploitability is
  low given the 30–90s TOTP validity window, but there's no reason for
  the inconsistency to exist). **Fix before Module 2: Recommended** —
  trivial, three decorator additions.
- **[MEDIUM] No backup-code regeneration endpoint.** Once a user
  exhausts all 10 backup codes without disabling/re-enabling MFA, they
  have no way to get a fresh set short of disabling MFA entirely — which
  itself requires a valid code they may not have. Real support-burden
  gap. Fix before Module 2: No, worth planning for the next auth-related
  pass.
- **[GOOD] The `otplib`-throws-on-malformed-input bug (ADR D4) and the
  backup-code hashing correction (ADR D3) were both caught by live
  testing, not left for a security review to find** — worth noting as a
  process win, not a remaining gap.

## 19. Session management review

- **[LOW] No maximum concurrent session cap.** A user (or an attacker
  with valid credentials) can accumulate unlimited sessions. Low priority
  at current scale; worth a cap + oldest-session-eviction policy
  eventually. Fix before Module 2: No.
- **[LOW] `lastActiveAt` only updates on token refresh** (every ~15 min
  at minimum, potentially up to 7 days if a client holds onto a still-
  valid access token without refreshing), not on every authenticated
  request — so the session list's "last active" can be stale. Cosmetic,
  not a security concern. Fix before Module 2: No.
- **[GOOD] Session/RefreshToken separation is the right call** and is
  already paying off — it's what makes `revoke-session` and password-
  reset's "kill everything" both simple, correct operations.

## 20. Refresh token review

- **[HIGH] Race condition in refresh rotation — no locking.** Verified:
  `refresh.use-case.ts` does `findByHash` → business checks → `create`
  (new token) → `markRotated` (old token) as separate, unsynchronized
  statements, with no row lock (`SELECT ... FOR UPDATE`) or optimistic
  concurrency check. If two requests present the *same* valid refresh
  token at nearly the same instant (a plausible client bug: double-
  submit, retry-on-timeout, or a race in a mobile client), both could
  read the token as "not yet revoked," both proceed to rotate it, and
  both succeed — producing two live sessions from what should be a
  single-use token, undermining the entire reuse-detection guarantee
  this flow exists to provide. **Solution:** use a conditional update
  (`UPDATE ... WHERE id = ? AND revokedAt IS NULL`, checking affected-row
  count) or wrap the read-then-write in `@Transactional()` with
  Postgres's default read-committed isolation plus an explicit row lock.
  **Fix before Module 2: Yes** — this is the second-highest-value fix in
  this report after the transaction gaps in §6, and it's the same root
  cause (missing atomicity on a security-critical multi-step operation).
- **[Cross-reference to §6/§16]** `rememberMe` not preserved through
  rotation — already covered, restating that it belongs to this section
  too.
- **[GOOD] The reuse-detection mechanism itself (nuking the whole session
  on detecting an already-rotated token being reused) is correctly
  designed and was verified live** (ADR, "Test the flow" section) —
  the race condition above is about the atomicity of getting *into* that
  state correctly, not a flaw in the detection logic itself.

## 21. Test coverage review

90 automated tests (61 unit / 13 integration / 16 e2e) is solid breadth
for a first pass. Gaps:

- **[MEDIUM] `JwtStrategy.validate()` has zero direct test coverage.**
  This is the method that re-checks `user.status` on every authenticated
  request — the entire mechanism the ADR relies on for "suspension takes
  effect within 15 minutes" is unverified by any test. Only indirectly
  exercised if an e2e test happens to hit it with a suspended user, which
  none currently do. **Fix before Module 2: Recommended** — this is
  security-relevant logic with no safety net.
- **[MEDIUM] No tests for `JwtAuthGuard`/`RolesGuard` in isolation** —
  same class of gap; currently only exercised transitively via e2e
  requests that happen to hit protected/public routes. Fix before Module
  2: Recommended, lower urgency than the strategy test above.
- **[LOW] No dedicated test for `HttpExceptionFilter`/
  `ResponseInterceptor`** beyond what e2e incidentally exercises. Fix
  before Module 2: No.
- **[LOW] 10 of 13 repository adapters have no dedicated integration
  test** — an explicit, documented tradeoff (only the 3 most complex/
  security-relevant adapters got dedicated tests; the rest are simple
  CRUD exercised transitively through e2e). Restating here for
  completeness, not as a new finding. Fix before Module 2: No.
- **[MEDIUM] No concurrency/race-condition test exists for the refresh-
  rotation issue in §20** — expected, since the bug itself wasn't known
  until this review. Once fixed, add a test that fires two concurrent
  refresh requests with the same token and asserts exactly one succeeds.
  Fix before Module 2: Yes, paired with the §20 fix.
- **[LOW] No CI pipeline runs any of these tests automatically.** See
  §23.

## 22. Missing edge cases

- **[HIGH] Duplicate-registration race condition (TOCTOU).** Verified: no
  `PrismaClientKnownRequestError`/`P2002` handling exists anywhere in the
  codebase. `register.use-case.ts` checks `findByEmail` (sees no match),
  then calls `create()` — if two requests for the same email run
  concurrently (double-click, client retry-on-timeout), both can pass the
  check before either commits; the second `create()` throws a raw Prisma
  unique-constraint violation that is **not** caught, surfacing to the
  client as a generic `500 Internal server error` instead of the correct,
  already-defined `409 EMAIL_ALREADY_REGISTERED`. **Solution:** catch
  `P2002` in `register.use-case.ts` (and audit other create-after-check
  patterns, e.g. `Organization.slug`, for the same shape) and map it to
  the existing `AppException`. **Fix before Module 2: Yes** — realistic
  trigger (any client-side retry logic or accidental double-submit), and
  the fix is a few lines.
- **[MEDIUM] JWT claims staleness extends to authorization, not just
  authentication.** The 15-minute "suspension takes effect within this
  window" tradeoff (ADR §7) applies equally to `roles` — a user demoted
  from `ADMIN` keeps admin-level JWT claims for up to 15 minutes after
  the demotion. Currently theoretical (no route is role-gated yet), but
  will become a real, exploitable-in-the-demotion-window gap the moment
  Module 2+ adds a role-gated route. Worth deciding now whether that's
  an accepted tradeoff (consistent with the existing suspension
  tradeoff) or whether role changes should force a session-wide re-auth.
  Fix before Module 2: No, but decide the policy before RBAC is used for
  gating anything.
- **[LOW] No account-deletion flow exists**, so cascading-delete blast
  radius (every session/token/MFA factor/OAuth link vanishes instantly,
  no grace period) is currently only a schema-level property, not a
  reachable feature. Worth designing a grace period before this is ever
  exposed. Fix before Module 2: No.
- **[LOW] Unicode/emoji in `displayName`** is length-validated but not
  otherwise sanitized — low risk (used in email templates and JSON
  responses, not rendered as HTML anywhere in this module), worth a note
  for whichever module first renders it in a web UI. Fix before Module 2:
  No.

## 23. Technical debt

- **[Restating §12 as the top debt item]** Inconsistent `@Transactional()`
  coverage — the longer this ships, the more use-cases will copy the
  non-transactional pattern by example.
- **[LOW] `QueueService` and `StorageService` are fully built,
  DI-registered, and have zero call sites.** Intentional platform-
  foundation work (ADR decision 8), but it's debt in the sense that it
  must be maintained (typechecked, kept building) for zero current value
  until a consumer exists. Same note for the `ApiKey` table/repository.
  Not a problem to fix, just a carrying cost worth being aware of when
  estimating Module 2+ work.
- **[LOW] No CI pipeline** (no `.github/workflows/` or equivalent found).
  90 tests exist but nothing runs them automatically on push/PR. Fine for
  a solo local-dev phase; becomes urgent the moment a second contributor
  or any deployment automation enters the picture. Fix before Module 2:
  Recommended if more than one person will touch this repo concurrently;
  otherwise defer.
- **[LOW] Three near-duplicate Jest configs** — see §2.

## 24. Future scaling risks

Given the master spec's explicit "millions of users" ambition, in
priority order:

1. **In-memory rate-limiting storage** (§6) — becomes actively
   *ineffective*, not just suboptimal, the moment there's more than one
   API instance. This is the highest-priority scaling risk in the
   codebase.
2. **Per-request DB lookup for user status** (§7) — becomes a real
   latency/DB-load contributor at high request volume; needs caching.
3. **Unbounded growth of `AuditEvent`, `Session`, and `RefreshToken`
   rows** — no cleanup job for expired/revoked tokens, no archival
   policy for audit history. Will eventually cause index bloat and
   slower queries on these tables if left unaddressed. A scheduled purge
   job (delete `RefreshToken`/`Session` rows revoked/expired > N days
   ago; archive `AuditEvent` rows > N months old) should exist before
   this matters in practice.
4. **No read-replica or query-splitting story** — not needed yet, just
   noting it's absent for when it is.
5. **Monolith growth** — as Recon, AI, Bug Bounty, Reports, etc. land per
   the master spec, module boundaries inside this one NestJS app need to
   stay real boundaries (no reaching across `modules/*` internals) or
   extracting a module into its own service later becomes much harder.
   Nothing in Module 1 violates this today — flagging it as a discipline
   to maintain going forward, not a current defect.

None of these block Module 2. All of them should be revisited before any
multi-instance or high-traffic deployment.

## 25. Refactoring recommendations

Consolidated, priority-ordered action list (severity in brackets):

1. **[HIGH]** Add `@Transactional()` to `reset-password`, `change-
   password`, `mfa-confirm`, `logout`, `revoke-session`. (§6, §12)
2. **[HIGH]** Fix the refresh-token rotation race condition with a
   conditional update or row lock; add a concurrency regression test.
   (§20, §21)
3. **[HIGH]** Catch `P2002` in `register.use-case.ts` (and any other
   check-then-create path) and map to the existing `AppException`. (§22)
4. **[HIGH]** Add OAuth `state` parameter protection to both strategies.
   (§6, §17)
5. **[HIGH]** Stop storing (or encrypt) `OAuthAccount.accessToken`/
   `refreshToken` — currently unused plaintext secrets. (§6, §17)
6. **[MEDIUM]** Standardize on `AppException` everywhere; replace the
   three stray `NotFoundException` throws or formally extend the
   documented rule to cover them with a real error code. (§13)
7. **[MEDIUM]** Tighten `@Throttle` on `/auth/mfa/setup`,
   `/auth/mfa/confirm`, `/auth/mfa/disable` to match `/auth/mfa/
   challenge`. (§18)
8. **[MEDIUM]** Persist `rememberMe`/extended-TTL through refresh
   rotation. (§6, §16, §20)
9. **[MEDIUM]** Require `currentPassword` to disable MFA. (§6)
10. **[MEDIUM]** Add `helmet` (or equivalent) for security headers. (§6)
11. **[MEDIUM]** Add unit tests for `JwtStrategy.validate()` and the two
    global guards. (§21)
12. **[MEDIUM]** Add security-notification emails (lockout, password
    changed, MFA disabled, new OAuth link, refresh-reuse detected) —
    `MailService`/`AuditService` already support this. (§6, §17)
13. **[LOW-MEDIUM]** Establish an API versioning convention before more
    modules add routes. (§10)
14. **[Deferred — not before Module 2, don't forget]** Redis-backed
    `ThrottlerStorage` before multi-instance deployment. (§6, §24)
15. **[Deferred — not before Module 2, don't forget]** Real Prisma
    migration history before any real Postgres target. (§9)
16. **[Deferred]** Scheduled cleanup job for expired tokens/old audit
    events. (§24)

Items 1–5 are all small, mechanical, and high-value — recommend doing
them as one focused pass before starting Module 2, rather than carrying
them forward as debt that a second module will start building on top of.
