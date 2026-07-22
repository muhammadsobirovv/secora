# Final Security Review — PentestHub AI, Modules 1-10

Reviewer stance: Staff Security Engineer, end-of-program gate after Module
10. Scope: `apps/api` end-to-end (auth, RBAC/ABAC, the Public API, GraphQL,
webhooks, the Plugin Marketplace, Integrations, Compliance), plus the
Desktop Agent's Local Bridge Server and the Browser Extension/Burp
integration where they cross a trust boundary. This is a platform-wide
gate review building on findings already fixed during Modules 1-10's own
development (each cited where relevant) — it does not re-litigate items
already closed, only what remains open or newly introduced.

**Headline**: no CRITICAL findings against default configuration. The
auth core (Module 1) remains the strongest-reviewed part of this codebase
and nothing in Modules 2-10 weakened it. The real remaining risk surface
is concentrated in three places, all disclosed in their own module's docs
but worth restating together here because a security reviewer should see
them as one coherent picture, not three separate footnotes: **(1)** Plugin
execution has no runtime sandbox, **(2)** the CVE-relevant dependency
surface (`@opentelemetry/*`, GraphQL stack, Prisma 7) has never actually
been installed or scanned in this project's history, and **(3)** several
subsystems (Plugin hooks, Integration actions) accept and execute
structured input from sources this platform doesn't fully control.

---

## 1. Authentication & session security (Module 1, unchanged) — solid

Argon2 password hashing, refresh-token rotation with reuse detection,
account lockout, OAuth CSRF state parameter, TOTP MFA + backup codes, rate
limiting on every auth-sensitive route (`@Throttle({ limit: 5, ttl:
60_000 })` on login/register/password-reset/MFA — verified present in
`auth.controller.ts`, `password.controller.ts`, `mfa.controller.ts`,
`email-verification.controller.ts`). No findings. This remains the
reference implementation the rest of the platform should be measured
against.

## 2. API-key & webhook authentication — correct patterns, verified this pass

`ApiKeyAuthGuard` (`apps/api/src/modules/public-api/guards/api-key-auth.guard.ts`)
authenticates via SHA-256 hash lookup against a DB index, not an
in-application byte comparison — the standard, correct pattern (this is
how GitHub/Stripe API keys work; a DB equality lookup on an indexed hash
column doesn't leak timing information the way an in-process
`===`/`memcmp` on a secret would). Webhook payloads are HMAC-SHA256 signed
(`webhook-signature.util.ts`) using `createHmac`, which is constant-time
by construction. No findings.

## 3. Metrics endpoint — confused-deputy risk found and fixed during this module

An early draft of `MetricsController.getQueueMetricsPrometheus` reused
`GetQueueMetricsQuery` (which authorizes via the *requesting user's* org
membership) by passing a fabricated `'system'` userId on a `@Public()`
route — an unauthenticated caller could have supplied an arbitrary
`?userId=` to probe which users belong to which organizations. **Fixed**
before this module shipped: the endpoint now computes the same aggregates
directly via Prisma with zero user-identity involvement, and
`OBSERVABILITY_METRICS_TOKEN` is mandatory (not optional) for this
specific route. Documented in `metrics.controller.ts`'s doc comment and
ADR 0010 §10. No further action — flagged here because a reviewer should
know this class of bug existed and was caught, not just that the current
code looks fine.

## 4. Compliance export — cross-tenant data leak found and fixed during this module

`ComplianceExportProcessorService`'s original `AuditEvent` query used
`where: scope.subjectUserId ? { userId: scope.subjectUserId } : {}` — since
`AuditEvent` has no `organizationId` column, the empty-object fallback
meant any organization admin's export request would have returned every
user's audit trail platform-wide, not just their own organization's.
**Fixed**: the query now resolves `organizationMember` userIds for the
requesting org first, then filters `AuditEvent.userId IN (...)`. This is
a genuine GDPR-relevant defect that would have shipped if not caught —
worth a regression test (`compliance-export-processor.service.spec.ts`
doesn't currently exist; recommend one asserting cross-org isolation
specifically) before this endpoint sees production traffic. **[MEDIUM,
open]**: add that regression test.

## 5. Plugin Marketplace — no runtime isolation (open, disclosed)

Restating from the Architecture Review (§4) with the security framing:
`ExecutePluginHookCommand` runs plugin hook code in the same process as
every other tenant's requests, with no separate container, WASM sandbox,
or syscall-level restriction. The permission model
(`acceptedPermissions`) is a real authorization gate on *what a plugin is
allowed to declare it does*, but nothing technically prevents installed
plugin code from doing something it didn't declare, up to and including
reading another tenant's data in the same process's memory space if a
plugin author writes it to. **[HIGH, open]** — treat any plugin from an
author the deploying organization doesn't fully trust as equivalent to
giving that author code execution inside the API process, because that is
exactly what it is today. This should block enabling third-party plugin
installation in any multi-tenant production deployment until real
isolation exists (a WASM runtime, a separate locked-down worker process,
or at minimum a network egress allowlist enforced outside the plugin's own
process). ADR 0010 §3 and the module doc both flag this; repeating it here
as the review's top security finding because disclosure in an ADR doesn't
substitute for a tracked remediation item.

## 6. Integrations & Automation Engine — generic action execution, worth a closer look

`ExecuteIntegrationActionCommand` and the Automation Engine's
`create_ticket`/`sync_data` step kinds both accept a `payload:
Record<string, unknown>` that gets forwarded to a third-party API on the
tenant's behalf (ADR 0010 §4, §8). **[MEDIUM, open]** Unlike the Plugin
Marketplace, this isn't arbitrary code execution — it's a bounded action
against a specific provider's API — but there's no schema validation on
`payload`'s shape beyond what each provider adapter chooses to enforce,
and a workflow's `params` (including `payload`) are defined by whoever
has `TEAM_LEAD+`/`ADMIN+` permission to create/update a `Workflow` (see
`workflows.commands.ts`). This is an acceptable trust boundary (the same
role tier that can create a workflow could already do most of what a
crafted payload might attempt through the UI directly) but should be
explicitly documented as "workflow authors are a privileged role, not
arbitrary users" in the Automation Engine's own docs — it currently isn't
stated that plainly anywhere.

## 7. Security headers — fixed this module (Module 10, §12 of ADR)

`helmet()`'s bare default (Module 1) would have broken Swagger UI's
inline bundle in any deployment that actually enabled it, and lacked
explicit HSTS/frameguard configuration. **Fixed**: tuned CSP (documented
exception for Swagger UI's inline script/style, `object-src 'none'`,
`frame-ancestors 'none'`), HSTS (`max-age=180d`, `includeSubDomains`, no
`preload`), explicit `frameguard: deny` — see `bootstrap.ts`. No further
action; this closes what would otherwise have been a real gap in any
deployment exposing `/api/docs`.

## 8. Dependency/supply-chain surface — largest open item, structurally

Every dependency added since Module 5 (GraphQL stack, `@opentelemetry/*`,
`@prisma/adapter-pg`/Prisma 7) has been added to `package.json` without a
single `pnpm install` ever completing against it in this project's
history — this sandbox has no package registry network access. **[HIGH,
open, structural]** This means: no `pnpm audit` has ever actually run
against the real resolved dependency tree used by Modules 5-10 (only
`security-scan.yml`'s *future* CI run will do this for the first time);
no version-pinning/lockfile-integrity issue would have been caught if one
exists; and the newly-added OTel packages in particular implement a
network-facing wire protocol (OTLP/HTTP export) that has never been
exercised even once. This is the single most important action item in
this report: **run `pnpm install && pnpm audit --audit-level high` in a
real environment before this branch is considered deployable**, not as a
formality but because it has genuinely never happened for roughly half
this project's dependency tree.

## 9. RBAC/ABAC coverage across ten modules — spot-checked, consistent

Every controller reviewed during this pass (`WorkflowsController`,
`ComplianceController`, `MetricsController`, `HealthController`,
`WebhookTokensController`) either declares an explicit role guard
consistent with its data sensitivity or is deliberately `@Public()` with
its own compensating control (a token check, in the metrics case) — no
controller was found relying on "authenticated but no further check" for
data that should be role-gated. This is a spot check, not exhaustive
coverage of all ~40 modules' controllers, but the pattern held everywhere
sampled.

## 10. Findings summary

| Severity | Finding | Status |
|---|---|---|
| HIGH | Plugin hook execution has no runtime sandbox | Open, disclosed |
| HIGH | ~Half the dependency tree (Modules 5-10 additions) never `pnpm install`'d or audited | Open, structural |
| MEDIUM | Automation Engine/Integrations payload trust boundary undocumented | Open |
| MEDIUM | No regression test for compliance export's cross-org isolation fix | Open |
| — | Metrics endpoint confused-deputy risk | Fixed during Module 10 |
| — | Compliance export cross-tenant audit leak | Fixed during Module 10 |
| — | Helmet CSP/HSTS gap | Fixed during Module 10 |

## 11. Recommendation

Do not enable third-party (untrusted-author) plugin installation, and do
not treat this branch as security-signed-off, until §8's `pnpm
install`/`pnpm audit` has actually run and §5's plugin isolation gap has
either been closed or the Plugin Marketplace is shipped restricted to
first-party/reviewed plugins only as an interim mitigation.
