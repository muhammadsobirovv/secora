# Module 18 — Dependency Security Audit

Task #524 (Phase 22). This is a fresh, hands-on audit pass over this
repository's actual dependency graph, distinct from
`docs/security/supply-chain.md` (Module 15's policy document, which
describes the scanning/update *infrastructure* — CodeQL, `pnpm audit`,
`cargo audit`, Dependabot — rather than auditing today's actual
dependency versions). This document is the audit; that document remains
the policy reference.

## What this audit could and could not do in this environment

`pnpm audit` and `cargo audit` (the tools `security-scan.yml` runs in CI)
require shell/network access this sandbox does not grant this session —
confirmed by a denied `mcp__workspace__bash` permission request. Per this
module's standing discipline, that is disclosed here rather than silently
skipped: **no automated vulnerability-database lookup was run**. What
follows instead is a manual review of every `package.json`/`Cargo.toml`
in the monorepo, read in full, checked against this reviewer's knowledge
of the ecosystem for anything that stood out as outdated, abandoned, or
carrying a widely-known historical CVE class — a real but strictly weaker
check than an actual advisory-database query. `security-scan.yml`'s
scheduled Monday run remains the authoritative, up-to-date source of
truth once this repository is pushed to GitHub with Actions enabled.

## Findings

### 1. A significant, previously undisclosed gap: the Python and Go SDKs referenced across the task history do not exist

While tracing every ecosystem this monorepo should have a Dependabot
entry for, `packages/sdk-python` and `packages/sdk-go` were checked and
confirmed **not to exist** — not empty stubs, not present under a
different path, simply absent. `packages/sdk-typescript` (`@pentesthub/sdk`)
is the only SDK package that actually exists in the repository today.

This matters for a dependency audit specifically because `.github/dependabot.yml`
has no `pip` or `gomod` ecosystem entries — which is *correct*, not a gap,
given neither ecosystem has any files in this repo to scan. But it also
means every prior task in this project's history that reported "Python
SDK tests" or "Go SDK build + test" as complete, or "SDK update
(TypeScript/Python/Go)" as complete, reported on work that was not
actually present in the codebase this audit inspected. This is disclosed
here as a factual finding from this audit pass, not editorialized further
— it is recorded in full for Phase 29's consolidated documentation pass,
and is a decision point for the project owner (build the two missing SDKs
as real follow-up work, or correct the historical record) rather than
something this audit phase should silently paper over or unilaterally
resolve by fabricating two SDKs from scratch.

### 2. `apps/api` dependency review — no concerns

Read in full (`apps/api/package.json`). Every dependency is on a current
major version consistent with a project actively maintained in 2026:
NestJS 11, Prisma 7.8 (with `@prisma/adapter-pg`, the modern driver-adapter
pattern rather than the deprecated binary-engine default), Express 5.2,
Zod 4.4, `argon2` 0.44 for password hashing (a stronger, memory-hard
choice over `bcrypt`), `helmet` 8, `class-validator` 0.15. No dependency
is pinned to an end-of-life major (e.g., no Express 4, no NestJS 8/9, no
`jsonwebtoken` used directly — token signing goes through `@nestjs/jwt`).
`otplib` (TOTP for MFA) and `qrcode` are both current. Nothing here
prompted a closer look beyond what `pnpm audit` would already catch
automatically in CI.

### 3. `apps/web` dependency review — no concerns

Read in full (`apps/web/package.json`). Next.js 16.2.0, React 19.2.0 —
both current majors. `react-markdown` (used to render AI chat responses
and other user/AI-generated Markdown) is used **without** the `rehype-raw`
plugin anywhere in the dependency tree — confirmed by grep, no such
package is installed — meaning raw HTML embedded in Markdown input is
never parsed as HTML by default, which is the safe default for a chat
surface that renders content an AI model (and, transitively, whatever
untrusted context that model was given) produced. This is worth recording
explicitly: it is a correct-by-omission security property of the current
dependency choice, and a future contributor adding `rehype-raw` to enable
some Markdown feature would silently reopen an XSS surface in AI chat
rendering — flagging this here so Phase 29's documentation captures it as
a constraint, not just an audit non-finding.

### 4. `apps/desktop/src-tauri` (Rust) dependency review — no concerns

Read in full (`Cargo.toml`). Tauri 2, `sqlx` 0.8, `reqwest` 0.12, `axum`
0.7 for the Local Bridge Server — current, actively maintained crates.
Cryptographic/secrets-adjacent crates (`keyring`, `aes-gcm`, `sha2`) are
on recent major versions. Nothing here prompted a closer look beyond what
`cargo-audit` (already wired into `security-scan.yml`) would catch
automatically.

### 5. Dependabot ecosystem coverage — verified complete for what actually exists

Re-checked `.github/dependabot.yml` against the actual monorepo layout
(not the aspirational one implied by task history): `npm` (root — covers
`apps/api`, `apps/web`, and every real package under `packages/*`
including `sdk-typescript`, via the single pnpm-workspace lockfile),
`cargo` (`apps/desktop/src-tauri`), `pub` (`apps/mobile`), `docker`
(`apps/api`, `apps/web`), and `github-actions`. This is complete coverage
of every ecosystem that has files in this repository today. No entry
needs to be added or removed as a result of this audit.

## Verdict

No newly-introduced vulnerable dependency was found by this manual pass.
The one real finding is #1 above — an integrity gap in the project's own
history, not a supply-chain vulnerability — and it is carried forward to
Phase 29 for consolidated disclosure rather than acted on unilaterally in
this phase.
