# Module 1 — Auth backend

Status: **backend complete** (register, verify, login, logout, refresh
rotation, forgot/reset/change password, Google/GitHub OAuth, TOTP MFA +
backup codes, RBAC foundation, session management, audit logging, rate
limiting, Swagger, seed data — all implemented, tested, and verified live
against a real database). Dashboard shell (Next.js frontend) not started.

See `docs/adr/0001-auth-module.md` for the full list of architectural
decisions and why each one was made.

## Scope

Email registration/login, Google/GitHub OAuth, email verification, password
reset/change, TOTP MFA, JWT access + refresh tokens with rotation, and
session/device management. See `PROJECT_SPEC.md` → Authentication.

Alongside auth itself, this sprint also built a platform foundation used by
every future module: full RBAC (Role/Permission/UserRole/RolePermission),
per-user Organizations (a personal workspace is created at registration),
an ApiKey table (schema only, no endpoints yet), UserPreferences, and three
swappable provider interfaces (Mail/Storage/Queue) with dev-local
implementations. See decision 8 in the ADR for exactly what's wired vs.
schema-only.

## Architecture

Ports-and-adapters throughout `apps/api/src/modules/*`: every aggregate
has a `domain/repositories/*.interface.ts` (a plain TypeScript interface +
a Symbol DI token) and a `infrastructure/persistence/prisma/prisma-*.ts`
implementation. Use-cases (`modules/auth/use-cases/*.use-case.ts`) depend
only on the interfaces — `PrismaService`/`PrismaClient` is imported
nowhere outside the `Prisma*Repository` adapter files themselves.
Controllers stay thin: DTO in, use-case call, DTO out.

Cross-repository transactions (e.g. register writes Users + Rbac +
Organizations + UserPreferences atomically) use `@Transactional()` from
`@nestjs-cls/transactional`, backed by a Prisma adapter parameterized with
this project's actual generated client type (see
`apps/api/src/prisma/prisma-transaction.types.ts` — the adapter's default
type parameter is `@prisma/client`'s standard client, not ours, which
silently produced an untyped transaction object until fixed).

## Data model

Defined in `apps/api/prisma/schema.prisma`, Postgres via Prisma 7 (using
the `@prisma/adapter-pg` driver adapter — Prisma 7's client no longer reads
`DATABASE_URL` from the schema file directly).

- **User** — core account. `passwordHash` is nullable so OAuth-only accounts
  (no password set) are representable. `status` (ACTIVE/SUSPENDED/DELETED) is
  separate from session revocation — suspending a user doesn't require walking
  every session row.
- **OAuthAccount** — one row per linked provider identity, unique on
  `(provider, providerUserId)`. A user can link multiple providers to one account.
- **OAuthExchangeCode** — one-time code handed to the frontend after an OAuth
  callback; exchanged via `POST /auth/oauth/exchange` for real tokens, so
  access/refresh tokens never appear in a redirect URL.
- **Session** — a device-level record (what the user sees in "manage devices").
  Distinct from `RefreshToken` on purpose: a session survives token rotation;
  revoking a session cascades to its refresh tokens. Carries `browser`/`os`
  (parsed from the User-Agent via `ua-parser-js`) and an unpopulated
  `location` column (no geo-IP provider configured in this environment).
- **RefreshToken** — always stored hashed (`tokenHash`), never plaintext.
  Rotated on every refresh (`replacedByTokenId` links the chain) so reuse of a
  stale token is detectable and treated as a compromise signal.
- **MfaFactor** / **MfaBackupCode** / **MfaChallengeToken** — one TOTP
  factor per user; `enabled` flips true only after a confirming code, so a
  half-configured factor never gates login. Backup codes are individually
  hashed rows (sha256, not argon2 — see ADR) so each is independently
  single-use.
- **EmailVerificationToken** / **PasswordResetToken** — short-lived, hashed,
  single-use (`usedAt`) tokens.
- **Role / Permission / RolePermission / UserRole** — RBAC foundation.
  Register assigns the default `USER` role; the access token's `roles`
  claim is resolved from these tables at login/refresh time.
- **Organization / OrganizationMember** — a personal workspace is created
  for every new user at registration (`OWNER` membership). No invites/
  switching/multi-member flows yet.
- **ApiKey**, **UserPreferences** — schema-only (ApiKey) or
  create-default-at-registration (UserPreferences); no dedicated endpoints.

Why hash tokens at rest: if the database leaks, stored hashes are useless to
an attacker without also breaking the hash — the same reasoning as password
storage, applied to bearer credentials.

## API contracts

Defined in `packages/shared/src/auth.ts` (DTOs), `auth-endpoints.ts` (route
paths), and `api-response.ts` (the `{success:true,data}` /
`{statusCode,code,message}` envelope every response uses). Both `apps/api`
and `apps/web` import from `@pentesthub/shared` instead of redeclaring
shapes.

Key decisions (full rationale in the ADR):

- `POST /auth/login` returns either `AuthTokensDto` or
  `MfaRequiredResponseDto` (discriminated by `mfaRequired: true`).
- Refresh tokens are opaque strings in the request body, not cookies.
- `AuthErrorCode` is a closed string union the frontend can branch on.
- Every response is wrapped: success as `{ success: true, data }`, errors
  as `{ statusCode, code, message }` — via a global interceptor/filter, not
  per-controller boilerplate.
- No global `/api` path prefix — routes match `auth-endpoints.ts` exactly.

## Running it locally

No system Postgres or Docker is assumed — Prisma 7 ships a bundled local
dev server (pglite/WASM-backed):

```
cd apps/api
npx prisma dev --detach       # prints a connection string
# put it in apps/api/.env as DATABASE_URL (see .env.example for the full var list)
npx prisma db push            # NOT `migrate dev` — see note below
npx prisma db seed            # creates RBAC roles + an admin/user dev account each
pnpm run start:dev            # or: pnpm run build && pnpm run start
```

**`db push`, not `migrate dev`**: the pglite-backed local server doesn't
support `migrate dev`'s shadow-database flow (a real Postgres target
should use normal `migrate dev`/`migrate deploy` with full migration
history — this project doesn't have a `prisma/migrations` directory yet
for that reason).

Swagger UI is at `http://localhost:3000/api/docs` once running. Dev emails
(verification/reset links) are written to `apps/api/.mail-outbox/*.txt`
instead of actually sending, since no SMTP provider is configured.

## Testing

Three separate pipelines, all under `apps/api`:

- `pnpm test` — 61 unit tests across all 18 use-cases, repository
  interfaces mocked directly (no DB, no network).
- `pnpm test:integration` — repository adapter tests against the real dev
  Postgres (`--runInBand`: the pglite backend corrupts prepared-statement
  state under Jest's default parallel workers — a backend limitation, not
  a product bug).
- `pnpm test:e2e` — full HTTP flows through the real app (register, MFA
  lifecycle, login lockout, rate limiting, refresh reuse detection) against
  the same dev Postgres.

All three (plus `build`/`lint`/`check-types`) must be green before a
commit, per the project's verification standard.
