# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning
follows the policy in `docs/architecture/release-engineering.md`.

Each entry below is a summary — the full record for a module is its own
`docs/releases/module-N-release-notes.md` (and, for the larger modules,
an ADR under `docs/adr/`).

## [1.0.0] — Final Release Hardening & Project Closure

The first stable release: `docs/architecture/release-engineering.md`'s
own versioning policy anticipated `1.0.0` once the plugin/API-versioning
surfaces built in Modules 13/15 settled, and this module — explicitly
the final module of the core development roadmap — is where that
settles. No `MAJOR`-breaking API change accompanies this bump; it
declares stability rather than introducing it, per the project's
additive-only API evolution policy (`docs/architecture/api-gateway.md`).

### Added

- `LICENSE` (repository root) formalizing the existing `UNLICENSED`/
  proprietary default already declared by every package's own
  `package.json`.
- API-keys resource added to all three SDKs (`packages/sdk-typescript`,
  `sdks/python`, `sdks/go`) and the CLI — closing a Module-15-era gap
  where `/public-api/keys/*` had zero client coverage.
- Quota enforcement + usage recording for `RECON_JOBS`/`SCANNER_JOBS` —
  these resource types were defined in plan defaults since Module 15 but
  never actually checked or metered until now.

### Fixed

- Stripe webhook event-ordering race (out-of-order delivery could apply
  an older event after a newer one) — disclosed in Module 19's security
  review, closed this module.
- `docker-compose.yml`, `.env.example`, and the Kubernetes manifests were
  missing several billing-related environment variables the worker
  process needs (`BILLING_PROVIDER`, `STRIPE_*`, `BILLING_WEBHOOK_SECRET`) —
  deployment drift from Module 15, fixed.
- `deploy/installer/install.sh` prompted for queue/cache/storage provider
  choices that were silently discarded for Enterprise Edition (which
  hardcodes Redis/MinIO in `docker-compose.enterprise.yml`) — dead
  prompts removed.

### Known limitations (documented, not fixed this release)

- `QUOTA_EXCEEDED` is returned as HTTP 403 by the Module-10-era entity-
  count quota subsystem but HTTP 429 by the Module-15-era usage-metering
  `QuotaService` — two different subsystems sharing one error code.
  Cosmetic-severity; reconciling them is left for a future pass.
- The quota check-then-act concurrency race (Module 19's security review)
  remains open — see `docs/reviews/0023-module-19-monetization-security-review.md`.

Full detail: `docs/reviews/0025` through `0030` (Module 20's phase-by-phase
review documents) and the Module 20 final report.

## [0.19.0] — Product Completion, Monetization & Launch Readiness

A baseline-audit-first pass: Module 15 already shipped a production-
quality billing/subscription/quota/usage/AI-cost backend, so this module
closed the one real remaining gap — no frontend for any of it. Added
`apps/web/lib/api/{organizations,billing}.ts`, billing/organization
hooks and components, and `/pricing`, `/settings/billing`,
`/settings/usage` pages, all honest about Community Edition and
provider-not-configured states. Reconciled nine historical backlog
tickets and fixed two small pre-existing defects
(`billing-endpoints.ts` missing leading slashes;
stale `BugBountyFindingStage`/`ScopeClassification` badge maps). A
dedicated security review found no IDOR, no client-controlled pricing,
and no usage-fabrication path, and disclosed (not fixed) the Stripe
webhook ordering and quota check-then-act issues closed/still-open
above. Full details: `docs/releases/module-19-release-notes.md`.

## [0.18.0] — Production Hardening, Observability & Reliability

No new product features — every one of this module's 31 phases hardens,
observes, tests, or documents Modules 1-17: production configuration
validation, a global error-handling model with request correlation IDs,
structured logging with secret redaction, health/readiness/liveness
endpoints, job-queue idempotency and state-machine hardening, a single
authoritative tool-execution path, rate-limiting/abuse-protection,
file/storage and SSRF security centralization, AI prompt-injection
regression tests, API performance passes (pagination caps, N+1 fixes,
indexes), SSE hardening, audit-log integrity, a metrics/observability
abstraction, and new `docs/operations/{database-migrations,
backup-recovery,production-deployment}.md` guides. Full details:
`docs/releases/module-18-release-notes.md`.

## [0.17.0] — Security Operations Center, Threat Intelligence & Autonomous Research Platform

Continuous attack-surface monitoring (`SecurityAsset` ownership model,
`AttackSurfaceEvent`), change-intelligence correlation, a threat-
intelligence engine with STIX/TAXII import, incident management with
full lifecycle/timeline/evidence, an AI SOC Analyst agent, defensive
security playbooks, Risk Engine v2, remediation tracking with an SLA
engine, SOC and Executive Security dashboards, and knowledge-graph/AI-
memory/automation-rule extensions covering the new domain models. Full
details: `docs/releases/module-17-release-notes.md`.

## [0.16.0] — Global Security Intelligence, Bug Bounty Platform & Collaboration

A `ScopeEngine` pre-execution gate in front of every recon/scan/tool
invocation, research sessions, an asset graph with technology
fingerprinting, an attack-surface dashboard with change detection,
deterministic finding fingerprinting and correlation, a Risk Engine,
bug-bounty submission/reward tracking, a safe terminal workspace,
visual research playbooks, real-time collaboration (watchers/reactions/
WebSocket gateway), public share links, a knowledge-graph query layer,
CVE intelligence enrichment, AI researcher memory, controlled-autonomy
AI investigation mode, generic approval gates, and an extension API
registry (`POST /extensions/:id/invoke`, permission-checked and SSRF-
guarded, added in a follow-up hardening pass). Full details:
`docs/releases/module-16-release-notes.md`.

## [0.15.0] — Production Hardening, Monetization & Marketplace

### Added

- Provider-agnostic billing: `PaymentProvider` interface, Stripe adapter
  (plain `fetch()`, no SDK dependency), `Subscription`/`Invoice`/`Plan`
  tables, hosted checkout, cancel/renew, and a dedicated Stripe webhook
  receiver with hand-rolled HMAC signature verification.
- Usage metering and configurable quota policies across AI, scans,
  recon, workers, and storage, enforced through `QuotaEnforcer`.
- Marketplace security: publisher verification, package signing,
  checksums, scan-result/security-advisory tracking, and enforced plugin
  permission declarations.
- Public API v1 versioning layer, expanded API key management (IP
  allowlists, per-key rate limits, rotation), and webhook platform
  improvements (replay, disable/enable, new event types).
- First-class integrations: Slack, Discord, Telegram, email, GitHub,
  GitLab, Jira, Linear, Teams, and a generic outbound webhook.
- AI cost control: per-workspace/organization budgets, spend alerts, and
  provider/model fallback on quota exhaustion.
- Privacy controls: self-service data export/deletion and telemetry
  opt-out, laying GDPR-readiness groundwork.
- Opt-in, privacy-aware telemetry framework (off by default).
- i18n architecture (English/Uzbek/Russian) and an accessibility audit
  across web, mobile, and desktop.
- First-run onboarding flow and an isolated, read-only demo mode
  (`Workspace.isDemo`) with public, rate-limited session creation.
- `/observability/health/diagnostics` combined self-test endpoint and a
  Settings → Diagnostics page with a one-click "attach to support
  ticket" flow.
- Codebase-wide consistent error handling: every `AppException` now
  carries a request-correlation ID end to end, plus root/segment-level
  React error boundaries on the web app.
- Public support-ticket intake (`POST /support/tickets`, no auth
  required) with optional diagnostics-snapshot attachment.
- `RELEASE_CHANNEL` (stable/beta/nightly, informational) surfaced on the
  liveness endpoint; root and app-level `package.json` versions
  synchronized to the module-tracking scheme for the first time.

### Changed

- `Organization.plan`/`subscriptionStatus` (legacy, Module 14) are now
  kept in sync as a denormalized read convenience alongside the new
  `Subscription` table rather than being the sole source of truth.

### Known gaps (see individual docs for detail)

- `npx prisma generate` / a real migration run have not been possible in
  this development sandbox (package physically absent from the local
  pnpm store) — every Module 15 schema change is captured in one
  consolidated `migration.sql` that must be applied and verified
  (`prisma migrate diff`) on a normal machine before deployment.
- `jest` is likewise unavailable in this sandbox this session; new
  command/query handlers were verified by manual code review and, where
  possible, targeted `tsc` checks rather than an automated test run.
- Billing UI pages (`/billing`, `/pricing`, `/settings/billing`) and the
  feature-flags service/UI remain outstanding within Module 15's scope.

## [0.14.0] — Cloud Platform, Enterprise SaaS & High Availability

Pluggable queue/cache/storage providers, leader election and distributed
locks, worker heartbeat/crash-recovery, database read-replica routing and
backup/migration validation, encrypted backups with a restore wizard,
mTLS/IP-allowlist/secrets-management security hardening, an Admin Console
infrastructure dashboard, Enterprise-only tenant management, an API
gateway (auth, rate limiting, response caching, versioning), cross-client
auto-update, and a GitHub Actions CI/CD pipeline with SBOM generation and
container signing. Full details: `docs/releases/module-14-release-notes.md`.

## [0.13.0] — MCP, Agent SDK & Automation Platform

An MCP server/client exposing platform resources and tools, a prompt
registry, an AI Agent SDK with built-in agents, a visual workflow
builder, a plugin SDK and script engine, an automation marketplace, local
(Desktop Agent) execution, AI evaluation tooling, a developer portal, and
a CLI. Full details: `docs/releases/module-13-release-notes.md`.

## [0.12.0] — Mobile App

A Flutter mobile client covering auth, dashboard, project/target/finding
management, reports, the AI Security Copilot, voice, evidence capture,
offline-first sync, and real-time updates, with Android/iOS CI/CD
pipelines. Full details: `docs/releases/module-12-release-notes.md`.

## [0.11.0] — Master AI Orchestrator & Autonomous Agents

Twelve specialized agent implementations under a master orchestrator,
long-term AI memory, a reasoning/planning engine, an OWASP/CWE/CAPEC/
MITRE/CVE knowledge base, autonomous recon/vulnerability analysis, an
incremental AI report writer, and per-workspace cloud/local/hybrid
privacy controls. Full details: `docs/releases/module-11-release-notes.md`.

## [0.10.0] — Enterprise & Scale

Multi-tenant architecture, expanded RBAC/ABAC, a distributed job system,
a plugin marketplace, an integrations framework, team workspaces,
advanced reporting/analytics, a GraphQL + webhook API platform, a visual
automation engine, a compliance module, and observability/HA/CI-CD
foundations. Full details: `docs/releases/module-10-release-notes.md`.

## [0.9.0] — Bug Bounty Hunter Platform

Multi-platform program management and import, scope management, a CVSS/
CWE/CAPEC-aware finding manager, an AI-assisted report builder,
collaboration (roles, comments, mentions, assignments), a bug-bounty
dashboard, scheduled automation, multi-channel notifications, and a
public REST API. Full details: `docs/releases/module-9-release-notes.md`.

## [0.7.0]–[0.8.0] — Desktop Agent & Browser Extension

A Tauri-based desktop agent with local tool execution, an SQLite-backed
local database and RAG layer, local AI provider connectors, a local
bridge server, and a full browser extension (MV3 background worker, AI
side panel, DevTools panel) plus a Burp Suite extension. No dedicated
numbered release notes file (delivered across the Module 7 range).

## [0.6.0] — Bug Bounty Hunter Toolkit (initial)

Bug bounty program domain models, scope management, finding lifecycle,
report generation, duplicate detection, a payload library, and a
knowledge base. Full details: `docs/releases/module-6-release-notes.md`.

## [0.5.0] — AI Security Copilot

Multi-provider AI abstraction, prompt architecture, pgvector-backed RAG,
tool calling, streaming chat, and (Phase 2) voice interaction, terminal
mode, artifact mode, and Mermaid-diagram canvas. Full details:
`docs/releases/module-5-phase-1-release-notes.md`,
`docs/releases/module-5-phase-2-release-notes.md`.

## [0.4.0] — Vulnerability Scanning Engine

Five scanner adapters (nuclei, nikto, ffuf, feroxbuster, dirsearch), an
execution/polling engine, and a vulnerability dashboard. Full details:
`docs/releases/module-4-release-notes.md`.

## [0.2.0]–[0.3.0] — Recon Engine

Six recon tool integrations (amass, katana, gau, waybackurls, WHOIS, ASN
lookup) with normalizers, job orchestration, and live-log streaming.
Full details: `docs/releases/module-2-release-notes.md`.

## [0.1.0] — Foundation

Authentication (email/password, OAuth, MFA), workspaces, projects,
targets, and the initial platform scaffold.
