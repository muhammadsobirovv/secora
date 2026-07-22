# PentestHub AI

A unified daily workspace for bug bounty hunters, penetration testers, and
security engineers — recon, vulnerability scanning, an AI security
copilot, and a full bug-bounty workflow (programs, scope, findings,
reports, payloads, knowledge base) in one product, so you stop switching
between HackerOne/Bugcrowd tabs, Burp, PayloadAllTheThings, HackTricks,
and a chat tab.

Canonical spec: `PROJECT_SPEC.md`. Architecture decisions: `docs/adr/`.

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
- `packages/shared` — `@pentesthub/shared`: DTOs, types, and endpoint
  constants shared between `apps/api` and `apps/web`.
- `packages/ui` — shared UI primitives (shadcn/ui-based).
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
