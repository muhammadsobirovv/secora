# Module 1 — Auth + Dashboard shell

Status: data model & API contracts designed. Backend/frontend implementation in progress.

## Scope

Email registration/login, Google/GitHub OAuth, email verification, password
reset/change, TOTP MFA, JWT access + refresh tokens with rotation, and
session/device management. See `PROJECT_SPEC.md` → Authentication.

## Data model

Defined in `apps/api/prisma/schema.prisma`, Postgres via Prisma 7.

- **User** — core account. `passwordHash` is nullable so OAuth-only accounts
  (no password set) are representable. `status` (ACTIVE/SUSPENDED/DELETED) is
  separate from session revocation — suspending a user doesn't require walking
  every session row.
- **OAuthAccount** — one row per linked provider identity, unique on
  `(provider, providerUserId)`. A user can link multiple providers to one account.
- **Session** — a device-level record (what the user sees in "manage devices").
  Distinct from `RefreshToken` on purpose: a session survives token rotation;
  revoking a session cascades to its refresh tokens.
- **RefreshToken** — always stored hashed (`tokenHash`), never plaintext.
  Rotated on every refresh (`replacedByTokenId` links the chain) so reuse of a
  stale token is detectable and treated as a compromise signal.
- **MfaFactor** — one TOTP factor per user for v1. `enabled` flips true only
  after the user confirms a code post-setup, so a half-configured factor never
  gates login.
- **EmailVerificationToken** / **PasswordResetToken** — short-lived, hashed,
  single-use (`usedAt`) tokens. Kept as separate tables rather than a generic
  "tokens" table so each has its own expiry policy and there's no type
  discriminator to get wrong.

Why hash tokens at rest: if the database leaks, stored hashes are useless to
an attacker without also breaking the hash — the same reasoning as password
storage, applied to bearer credentials.

## API contracts

Defined in `packages/shared/src/auth.ts` (DTOs) and
`packages/shared/src/auth-endpoints.ts` (route paths). Both `apps/api` and
`apps/web` import from `@pentesthub/shared` instead of redeclaring shapes, so
a contract change is a single-package edit that TypeScript will fail loudly
on on both sides if consumers aren't updated.

Key decisions:

- `POST /auth/login` returns either `AuthTokensDto` or
  `MfaRequiredResponseDto` (discriminated by `mfaRequired: true`). The client
  branches on that field rather than the endpoint issuing a second HTTP status
  code path, keeping the login flow a single request/response contract.
- Refresh tokens are sent as opaque strings in the request body, not cookies,
  for v1 — this keeps native/desktop/mobile clients (Flutter, per the spec's
  multi-platform requirement) on the same auth flow as the web client instead
  of needing cookie-jar handling.
- `AuthErrorCode` is a closed string union, not free-text messages, so the
  frontend can branch on error type (e.g. show "resend verification email"
  specifically on `EMAIL_NOT_VERIFIED`) without string-matching.

## Local development database

No system Postgres or Docker is assumed. Use Prisma's bundled local dev
server:

```
cd apps/api
npx prisma dev
```

Then set `DATABASE_URL` in `apps/api/.env` (copy from `.env.example`) to the
connection string it prints, and run `npx prisma migrate dev`.
