# PentestHub AI

A unified daily workspace for bug bounty hunters, penetration testers, and
security engineers — recon, vulnerability scanning, an AI security
copilot, and a full bug-bounty workflow (programs, scope, findings,
reports, payloads, knowledge base) in one product, so you stop switching
between HackerOne/Bugcrowd tabs, Burp, PayloadAllTheThings, HackTricks,
and a chat tab.

Canonical spec: `PROJECT_SPEC.md`. Architecture decisions: `docs/adr/`.
Found a security issue? See `SECURITY.md` for how to report it privately.

## Local-first architecture

PentestHub AI is being migrated to a **local-first** architecture: the
backend is a thin metadata/coordination layer (auth, workspace/project/
target metadata, findings metadata, activity, team collaboration,
notifications, sync, RBAC, audit) and a separate **Desktop Agent**
(Tauri) runs everything expensive — recon tool execution, vulnerability
scanning, AI inference (your own provider keys, never ours), local RAG,
voice, and report generation — entirely on your machine. Private target
and finding data never leaves your computer unless you opt into sync.

This migration is in progress. See:

- `docs/migration/local-first-architecture-migration.md` — the audit of
  what's currently server-side and what's moving.
- `docs/adr/0007-local-first-desktop-agent-architecture.md` — the
  decision record.
- `docs/migration/desktop-agent-roadmap.md` — the phased build plan.

## Monorepo layout

Turborepo + pnpm workspaces:

- `apps/api` — NestJS 11 backend (CQRS via `@nestjs/cqrs`, Prisma/
  PostgreSQL, a separate `worker.main.ts` process for background job
  pollers).
- `apps/web` — Next.js 16 / React 19 frontend.
- `apps/desktop` — Tauri desktop agent (Rust) — local-first tool runner,
  job queue, sync engine, local AI/RAG, voice, file manager.
- `apps/mobile` — Flutter cross-platform mobile app (Android/iOS) —
  Clean Architecture, feature-first, Riverpod, GoRouter, offline-first
  Projects/Targets/Findings with a sync-engine/outbox pattern.
- `packages/shared` — `@pentesthub/shared`: DTOs, types, and endpoint
  constants shared between `apps/api`, `apps/web`, `apps/desktop`,
  `apps/mobile`, `packages/sdk-typescript`, `packages/agent-sdk`, and
  `packages/cli`.
- `packages/ui` — shared UI primitives (shadcn/ui-based).
- `packages/sdk-typescript` — `@pentesthub/sdk`: a TypeScript client
  (`PentestHubClient`, `HttpClient`, `McpClient`) for the REST API and
  the MCP server.
- `packages/agent-sdk` — `@pentesthub/agent-sdk`: the AI Agent SDK
  runtime and eleven built-in specialist agents.
- `packages/cli` — `@pentesthub/cli`: a dependency-free `pentesthub`
  command-line tool built on `packages/sdk-typescript`.
- `packages/eslint-config`, `packages/typescript-config` — shared tooling
  config.

## Modules

1. **Auth** — register/login, JWT + refresh rotation, Google/GitHub
   OAuth, TOTP MFA, session/device management. `docs/adr/0001-auth-module.md`
2. **Workspace Foundation** — Workspaces, Projects, Targets, Notes,
   Evidence, Tags, Activity Timeline, Search. `docs/adr/0002-workspace-foundation-module.md`
3. **Recon Engine** — 14 recon tools (Subfinder, Amass, HTTPX, Katana,
   Naabu, Nmap, DNSx, WhatWeb, Gowitness, WHOIS, ASN, and more) behind one
   `ToolRunner`/`Normalizer` abstraction. `docs/adr/0003-recon-engine-module.md`
4. **Vulnerability Engine** — scanner orchestration (Nuclei, ffuf,
   dirsearch, feroxbuster, Nikto) with a normalized finding pipeline.
   `docs/adr/0004-vulnerability-engine-module.md`
5. **AI Security Copilot** — workspace-aware chat, RAG, a multi-provider
   abstraction, tool calling, voice interaction, code artifacts.
   `docs/adr/0005-ai-security-copilot-module.md`
6. **Bug Bounty Workspace** — Programs, Scope Manager, Asset Inventory,
   Finding Lifecycle, Bug Report Generator, AI Report Draft Assistant,
   Duplicate Detection, Payload Library, Knowledge Base, Calendar,
   Notifications, Search. `docs/adr/0006-bug-bounty-workspace-module.md`
7. **Desktop Agent** (`apps/desktop`, Tauri) — local tool runner, job
   queue, SQLite storage, Sync Engine, local AI + RAG, voice, file
   manager, local report generator, plugin manager.
   `docs/adr/0007-local-first-desktop-agent-architecture.md`
8. **Browser Extension + Burp Suite Integration** — a Local Bridge Server
   on the Desktop Agent plus a Manifest V3 browser extension and a Burp
   Suite extension for target capture, recon shortcuts, an AI side panel,
   and Live Sync across desktop/browser/Burp.
   `docs/adr/0008-browser-extension-burp-integration.md`
9. **Bug Bounty Platform + Collaboration + Reporting Suite** — extends
   Module 6 into a team platform: multi-platform Program Importer with
   update detection, a CVSS 3.1 calculator + CWE/CAPEC/OWASP/MITRE
   mapping, custom report templates + AI grammar/technical review,
   Collaboration (roles, comments, mentions, assignments, tasks, activity
   feed), an AI Bug Bounty Assistant, Knowledge Base entry kinds +
   tagging, scheduled Automation, multi-channel Notifications, filterable
   Analytics, extended Global Search, a Public REST API (keys/webhooks),
   and encrypted-at-rest secrets. `docs/adr/0009-bug-bounty-operating-system.md`,
   `docs/security/permission-matrix.md`
10. **Enterprise Platform + SaaS + Global Infrastructure** — multi-tenant
    `Organization`/`Team` above the existing Workspace boundary, a
    Postgres-native Distributed Job System, a Plugin Marketplace, an
    Integrations framework, Team Workspaces, Enterprise Reporting/
    Analytics, a full API Platform (GraphQL, webhooks, TypeScript/Python/Go
    SDKs), a Workflow Automation Engine, Compliance (retention/backup/GDPR
    export), Observability, High Availability, Security Hardening, CI/CD,
    and four production deployment paths.
    `docs/adr/0010-enterprise-platform.md`
11. **AI Security Copilot + Autonomous Multi-Agent System** — a Master AI
    Orchestrator that decomposes a free-text goal into a task tree and
    delegates it across twelve specialist agents, a searchable AI
    Knowledge Base (OWASP/CWE/CAPEC/MITRE ATT&CK/NIST/CVE), an
    Explainability layer, and per-workspace Privacy Mode
    (cloud/local/hybrid) controls — a new `/agent` Agent Copilot surface
    alongside Module 5's existing `/ai` chat.
    `docs/adr/0011-ai-security-copilot-multi-agent-system.md`
12. **Cross-Platform Mobile Application (Flutter)** (`apps/mobile`) — a
    Flutter app joining `apps/web` and `apps/desktop` as a third
    first-class client of `apps/api`: full Module 1 auth (incl.
    biometrics/PIN device lock), offline-first Projects/Targets/Findings
    via a shared sync-engine/outbox pattern, Reports, an AI Security
    Copilot screen (Module 11 integration — streaming chat, voice,
    Orchestrator run tracking, Knowledge Base search), Evidence Capture,
    File Manager, Global Search (with an offline FTS5 fallback),
    Settings, Workspace, Analytics, and security hardening (encrypted
    storage, certificate pinning, jailbreak/root detection).
    `docs/adr/0012-mobile-application.md`,
    `docs/mobile/mobile-architecture-guide.md`
13. **AI Automation Platform + MCP Ecosystem + Security Agent SDK** — a
    standards-compliant Model Context Protocol server/client (`/mcp/rpc`,
    `packages/sdk-typescript`'s `McpClient`), an AI Agent SDK
    (`packages/agent-sdk`) with eleven built-in specialist agents, a
    Workflow Builder extension (parallel/approval steps, webhook/event
    triggers), a Plugin SDK + sandboxed Script Engine sharing one
    `node:vm` execution primitive, an Automation Marketplace, Local
    Execution (Desktop Agent/Browser Extension relay), AI Evaluation,
    an AI Platform Observability dashboard, a Developer Portal, and
    `packages/cli` (`@pentesthub/cli`).
    `docs/adr/0013-ai-automation-platform-mcp-ecosystem.md`,
    `docs/modules/13-ai-automation-platform-mcp-ecosystem.md`,
    `docs/mcp/mcp-guide.md`
14. **Cloud Platform, Enterprise SaaS & High Availability** — pluggable
    queue/cache/storage provider abstractions (each defaulting to a
    zero-dependency binding), a generalized distributed-lock/leader-
    election primitive, a real encrypted backup system, an Admin Console
    aggregating cluster/worker/queue/cache/storage/database/backup/
    licensing state, Enterprise-only Tenant Management (billing/
    branding/usage, edition-gated), an opt-in response-caching API
    Gateway, cross-client Auto Update, and production-grade CI/CD
    (SBOM, container signing, Trivy scanning, release automation) — all
    holding the standing "no mandatory paid service" guarantee, verified
    by a dedicated audit this module.
    `docs/adr/0014-cloud-platform-enterprise-saas-ha.md`,
    `docs/modules/14-cloud-platform-enterprise-saas-ha.md`,
    `docs/architecture/{api-gateway,auto-update,ci-cd}.md`
15. **Production Hardening, Monetization & Marketplace** — a
    `PaymentProvider` abstraction with a Stripe adapter (checkout,
    subscriptions, invoices, and an independent HMAC-verified
    `POST /billing/webhook/stripe`), usage metering + quota enforcement,
    marketplace security (publisher verification, checksums, enforced
    per-plugin permission declarations), a versioned Public API v1 layer,
    nine outbound integrations, AI spend budgets, self-service privacy
    controls (data export/deletion, telemetry opt-out) with a GDPR
    readiness foundation, i18n (English/Uzbek/Russian) and an
    accessibility audit, first-run onboarding + isolated demo mode,
    health diagnostics + correlation-ID error handling + a support ticket
    queue, semantic-versioned release engineering (`CHANGELOG.md`,
    `RELEASE_CHANNEL`), and a feature-flags system with USER/WORKSPACE/
    ORGANIZATION override precedence — all holding the standing "no
    mandatory paid service" guarantee, reverified by a dedicated audit
    this module.
    `docs/adr/0015-production-hardening-monetization-marketplace.md`,
    `docs/architecture/{stripe-webhook,feature-flags,release-engineering,
    health-diagnostics,error-handling,support-system,demo-mode,i18n,
    onboarding}.md`,
    `PRIVACY.md`, `docs/compliance/gdpr-readiness.md`
16. **Global Security Intelligence, Bug Bounty Platform & Collaboration** —
    a pre-execution `ScopeEngine` gate, Research Sessions with recon/
    technology/asset-graph intelligence, deterministic Finding
    fingerprinting + a correlation-based Risk Engine, CVE enrichment +
    vulnerability matching, controlled-autonomy AI Investigation Mode
    behind a generic Approval Gate, Bug Bounty submissions with reward
    tracking, a Safe (allowlisted, sandboxed) Terminal, visual Playbooks,
    Collaboration extensions (Watchers/Reactions), a real-time SSE
    gateway, Public Sharing (share links), a Knowledge Graph query layer,
    long-term AI Memory, and an Extension API Registry with a permission-
    checked, SSRF-guarded invocation endpoint.
    `docs/releases/module-16-release-notes.md`
17. **Security Operations Center, Threat Intelligence & Autonomous
    Research Platform** — Continuous Attack Surface Monitoring +
    change-intelligence correlation, a Threat Intelligence engine (public
    feed adapters, STIX/TAXII import with bounded/sanitized parsing, an
    exact-value Threat Matching correlation engine), full Incident
    Management (lifecycle, timeline, evidence/indicator/asset linking) with
    an advisory-only AI SOC Analyst and a defensive AI Investigation
    Workflow — both gated behind the existing Approval mechanism and both
    fencing untrusted evidence/threat-intel text before it ever reaches a
    prompt, Defensive Security Playbooks, Risk Engine v2 (persisted,
    explainable score history), Remediation tracking with an
    evidence-backed verification workflow, an SLA Engine (policy +
    persisted breach event log), an Automation Rules engine (workspace-
    scoped ownership checks on every action target, approval-gated for
    anything beyond a plain notification), and SOC/Executive dashboards —
    plus Knowledge Graph, AI Memory, Global Search, and CLI/SDK (TS/Python/
    Go) extensions covering the whole surface.
    `docs/releases/module-17-release-notes.md`

Modules 3-6's compute-heavy pieces are being migrated to the Desktop
Agent per the local-first architecture above — see the migration docs
for exactly what's moving and when.

## Development

```bash
pnpm install
pnpm dev            # runs apps/api and apps/web via Turborepo
pnpm build           # build all packages/apps
pnpm lint            # lint all packages/apps
pnpm check-types      # typecheck all packages/apps
pnpm test             # run all test suites
```

`apps/api` needs a PostgreSQL database (see `apps/api/.env.example`) and
`pnpm --filter api prisma generate` / `prisma migrate dev` before first
run. `apps/api`'s background job pollers (Recon, Vuln, Bug Bounty
deadline notifications) run as a separate process: `pnpm --filter api
worker:dev`.

## Documentation

- `PROJECT_SPEC.md` — the master specification; all architecture and
  roadmap decisions trace back to it.
- `docs/adr/` — architecture decision records, one per module.
- `docs/releases/` — per-module release notes.
- `docs/migration/` — the local-first architecture migration audit and
  roadmap.
- `SECURITY.md` — how to report a security vulnerability.
- `PRIVACY.md` — what data this platform collects and your rights over
  it; `docs/compliance/gdpr-readiness.md` has the detailed mapping.
- `CHANGELOG.md` — release history from `0.1.0` onward.
