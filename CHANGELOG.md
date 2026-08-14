# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning
follows the policy in `docs/architecture/release-engineering.md`.

Each entry below is a summary — the full record for a module is its own
`docs/releases/module-N-release-notes.md` (and, for the larger modules,
an ADR under `docs/adr/`).

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
