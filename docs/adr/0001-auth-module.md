# ADR 0001 — Auth module (Module 1) architecture and implementation decisions

Status: accepted, implemented.
Context: `PROJECT_SPEC.md`, `docs/modules/01-auth.md`, plan at
implementation time (`/home/kali/.claude/plans/lucky-spinning-tarjan.md`).

This records the decisions made building the auth backend — what was
decided up front, what changed during implementation, and why. Grouped
by when the decision was made: **planned** (agreed before writing code)
vs. **discovered** (surfaced by actually running the code against a real
database and real HTTP requests).

---

## Planned decisions

### 1. Redis deferred

The spec listed Redis as "(if needed)". Rate limiting uses
`@nestjs/throttler`'s in-memory storage (correct for a single instance);
MFA challenge / OAuth exchange tokens use short-lived hashed DB rows
following the same pattern as email-verification/password-reset tokens,
rather than a cache. `ThrottlerStorage` is swappable via its own
interface, so a Redis-backed adapter for multi-instance deployment is a
config change later, not a rewrite.

### 2. Ports-and-adapters repository layer

Every aggregate has a `domain/repositories/*.interface.ts` (interface +
Symbol DI token) and a `infrastructure/persistence/prisma/prisma-*.ts`
adapter. Use-cases depend only on the interface; `PrismaService` is
injected nowhere outside the adapter classes. This was a explicit
correction mid-planning — the original proposal was "no repository layer,
inject PrismaService directly" (Prisma already being a clean, typed data
layer) — overruled in favor of full port/adapter separation so persistence
can be swapped later without touching business logic, and so unit tests
mock narrow, purpose-built interfaces instead of a generic ORM client.

Repository interfaces expose the specific operations each use-case needs
(`recordFailedLogin`, `findValidByHash`, ...), not generic CRUD —
Interface Segregation over a passthrough surface.

Entity types: repositories return the Prisma-generated model types
(`User`, `Session`, ...) rather than hand-duplicated domain classes.
These are plain data shapes with no query methods attached, so importing
them is a type-only dependency — the actual coupling this decision guards
against (use-cases calling `prisma.user.findUnique(...)` directly) is
fully eliminated either way.

Cross-repository transactions (register writes Users + Rbac +
Organizations + UserPreferences atomically) use `@nestjs-cls/transactional`'s
`@Transactional()` decorator rather than threading a Prisma transaction
client through every repository method's signature (which would leak a
Prisma-specific type into otherwise persistence-agnostic interfaces).

### 3. Schema additions beyond the originally-committed model

`MfaBackupCode` replaces a `backupCodes String[]` field (a plain array
can't be hashed-and-individually-consumed); `AuditEvent`
(`userId` nullable + `onDelete: SetNull` so history survives account
deletion); `MfaChallengeToken` and `OAuthExchangeCode` (same shape as the
existing verification/reset tokens).

### 4. OAuth callback → frontend handoff via one-time exchange code

`GET /auth/oauth/:provider/callback` creates an `OAuthExchangeCode` and
redirects to `${FRONTEND_URL}/auth/oauth/callback?code=...`; the frontend
POSTs that code to `/auth/oauth/exchange` for real tokens. Keeps
access/refresh tokens out of the redirect URL entirely (browser history,
referrer headers, server logs).

### 5. No real email provider

`MailService` is an interface (`common/providers/mail/`); the only
implementation is `DevMailService`, which logs and writes to
`apps/api/.mail-outbox/*.txt`. Swapping in a real provider later is a new
class + one DI binding in `providers.module.ts`.

### 6. Response envelope

A global interceptor wraps success bodies as `{ success: true, data }`; a
global exception filter returns errors as `{ statusCode, code, message }`
— unwrapped (no redundant `success: false`, the non-2xx status already
signals that). Required one additive type in `packages/shared`
(`ApiSuccessResponse<T>`/`ApiErrorResponse`).

### 7. Access token claims and refresh token shape

Access tokens carry `roles: string[]` and `sessionId`, 15m TTL.
`JwtStrategy` re-checks `user.status` on every request (one indexed PK
lookup) so a suspension/lock takes effect within that window rather than
waiting for the token to expire. Refresh tokens are opaque random strings
(not JWTs), 7d TTL (30d with `rememberMe`), stored only as a sha256 hash —
the standard shape for *revocable* refresh tokens; a signed JWT refresh
token would still need a DB check to be revocable, so opaque is strictly
simpler.

### 8. Platform-foundation schema (RBAC, Organizations, ApiKey, UserPreferences, provider interfaces)

Added per explicit direction beyond the original auth-only scope — schema
and minimal wiring only, no business features:

| Addition | Wired this sprint | Explicitly not this sprint |
|---|---|---|
| Full RBAC (Role/Permission/RolePermission/UserRole) | Register assigns `USER`; JWT `roles` claim resolved from these tables; `RolesGuard`/`@Roles()` mechanism exists | No role/permission management endpoints; nothing is actually gated by role yet |
| Organization + OrganizationMember | Register creates a personal Organization + OWNER membership | Invites, switching, multi-member workflows |
| ApiKey | Schema + repository only | No create/list/revoke endpoints, no API-key auth strategy |
| UserPreferences | Register creates a default row | No settings-update endpoint |
| Session device info | `browser`/`os` parsed from User-Agent at session creation | `location` column exists, left unpopulated — no geo-IP provider configured |
| Mail/Storage/Queue provider interfaces | Interfaces + dev-local implementations (console+file mail, local-disk storage, in-memory queue), DI-bound and ready | Nothing consumes Storage/Queue yet — no upload endpoints, no job processors |

---

## Discovered during implementation

These weren't anticipated in planning — they surfaced by actually
building, booting, and exercising the system against a real database and
real HTTP requests, per this project's verification standard of testing
runtime behavior rather than trusting a design on paper.

### D1. `nest build`'s compiler ignores `moduleResolution: nodenext` against the generated Prisma client

Prisma 7's `prisma-client` generator outputs ESM-only TypeScript. `apps/api`
uses `moduleResolution: nodenext`, which should emit ESM when the nearest
`package.json` has `"type": "module"` — but `nest build`'s internal
compiler emitted CommonJS regardless, crashing at boot
(`ReferenceError: exports is not defined in ES module scope`). Plain
`tsc -p tsconfig.build.json` emits correctly. Switched `build` to `tsc`
directly and `start:dev`/`start:debug` to `tsx watch` (both handle
NodeNext ESM correctly); `nest build`/`nest start` are no longer used.

### D2. `TransactionalAdapterPrisma`'s default type parameter is `@prisma/client`'s standard client, not ours

Left unparameterized, `TransactionHost#tx`'s type couldn't be resolved
from `$transaction`'s signature and silently collapsed to `any` — caught
by eslint's `no-unsafe-*` rules (not by `tsc`, since `noImplicitAny` is
off). Added `prisma-transaction.types.ts` exporting
`AppTransactionalAdapter = TransactionalAdapterPrisma<PrismaClient>`
(our generated client), imported by every repository and `app.module.ts`
instead of the bare adapter type.

### D3. MFA backup codes: argon2 was the wrong hash, not just a style choice

Originally planned to hash backup codes with argon2 like passwords (both
"human-facing secrets"). But the repository does a direct hash lookup
(`findUnusedBackupCodeByHash`), which requires a **deterministic** hash —
argon2 is salted and non-deterministic by design. Backup codes are
actually high-entropy crypto-random values (5 bytes via
`randomBytes(5).toString("hex")`), not human-chosen secrets, so sha256
(via `TokenService.hashOpaqueToken`, the same path used for refresh/
verification/reset tokens) is both correct and simpler.

### D4. `otplib`'s `verify()` throws on malformed input instead of returning `{valid:false}`

A 10-character backup code reaching TOTP verification (the fallback path
in `mfa-challenge`/`mfa-disable`) threw `TokenLengthError`, producing a
500 before the backup-code check could ever run — found by actually
attempting a backup-code login live, not by reading the code. Fixed by
wrapping `TotpService.verifyCode` in try/catch, treating any verification
failure (wrong code *or* malformed input) as `false`.

### D5. `reset-password` session-revocation ordering bug

Original implementation called `sessionsRepository.revokeAllForUser()`
*then* `sessionsRepository.findActiveByUser()` to find refresh tokens to
revoke — but the first call already marks sessions revoked, so the second
query (which filters `revokedAt: null`) returns nothing, leaving refresh
tokens live after a password reset. Caught in code review before it ever
ran; fixed by querying active sessions first, then revoking their refresh
tokens, then revoking the sessions. Now guarded by an explicit regression
test asserting call order.

### D6. pnpm's strict `node_modules` surfaced four transitive-dependency gaps

`dotenv`, `express`, `@jest/globals`, and (early on) `sharp`/`prisma`
native builds were all used directly (as type imports or runtime imports)
but only present transitively through other packages. Under pnpm's
default strict linking, TypeScript/Node couldn't resolve them —
symptoms ranged from a silent `any`-typed import (`express`'s `Request`)
to a hard crash (`dotenv` in the seed script) to a `tsc` failure only
(`@jest/globals`, since Jest itself resolves fine at runtime through its
own module resolution). All four added as direct dependencies.

### D7. Express 5 / `@types/node` header-array typing gap

`req.headers['user-agent']`, once narrowed via `Array.isArray()`, typed
its array branch as `any[]` instead of `string[]` — an upstream typing
quirk, not a real type-safety hole (HTTP headers are always strings by
spec). Fixed with a documented, narrow cast in `extractRequestContext`.

### D8. pglite (the local dev Postgres) doesn't support `migrate dev`'s shadow-database flow

`npx prisma migrate dev` failed with `P1017: Server has closed the
connection` against the bundled local dev server; `npx prisma db push`
works fine. Documented as an environment-specific workflow difference — a
real deployment target (managed Postgres) should use normal `migrate dev`/
`migrate deploy` with full migration history.

### D9. pglite corrupts prepared-statement state under concurrent connections

Running the repository integration test suite in Jest's default parallel
workers (each opening its own Prisma/pg connection to the same pglite
instance) produced `DriverAdapterError: bind message supplies N
parameters, but prepared statement "" requires 0` on unrelated queries —
a backend concurrency limitation, not a product bug (confirmed by running
the identical suite serially via `--runInBand`, which passes reliably).
`pnpm test:integration` runs with `--runInBand` for this reason.

### D10. e2e test suite: shared throttler state across test blocks

The first version of the e2e suite shared one app instance (and therefore
one in-memory `ThrottlerStorage`) across every `describe` block. Since
`/auth/login` is rate-limited at 5 req/60s and the suite's later blocks
(login lockout, MFA lifecycle) each need more than 5 login calls to prove
their actual business logic, they collided with earlier blocks' quota
usage and with each other. Fixed two ways: (a) each top-level `describe`
block now bootstraps its own app instance, so each starts with fresh
throttler storage; (b) the login-lockout test specifically arranges its
"4 prior failures" state directly via Prisma rather than driving 5 real
HTTP calls, since throttle-limit (5/60s) and lockout-threshold (5
attempts) coincidentally share the same number and would otherwise
collide even within one block. A dedicated `describe` block with its own
app instance verifies the 429 path itself.

---

## Explicitly out of scope this sprint

Carried over from the plan and unchanged by implementation: Redis-backed
rate limiting, RBAC management endpoints, permission-gated routes,
Organization invites/switching, API key issuance, user-preferences
settings endpoint, geo-IP session location, file upload endpoints, queue
job processors, and a formal Prisma migration history (schema sync is via
`db push` in this environment — see D8).
