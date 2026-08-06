# PentestHub AI — Master Specification

> This is the canonical Master Specification for PentestHub AI. All architecture,
> module, and roadmap decisions must trace back to this document. Do not fork or
> rewrite this file casually — amend it deliberately as the product evolves.

---

# Core Philosophy

The platform must become the daily workspace of every pentester.

Users should no longer need to constantly switch between:

* HackerOne
* Bugcrowd
* Intigriti
* GitHub
* Burp Suite documentation
* PayloadAllTheThings
* HackTricks
* NVD
* CVE databases
* OWASP
* Google searches
* ChatGPT

Everything should exist inside one unified ecosystem.

---

# Local-First Core Principle

> Added 2026-07-16, superseding the implicit "backend executes
> everything" assumption in every section below that predates it. Full
> audit, decision record, and build plan: `docs/migration/local-first-architecture-migration.md`,
> `docs/adr/0007-local-first-desktop-agent-architecture.md`,
> `docs/migration/desktop-agent-roadmap.md`.

PentestHub AI is **local-first**. The backend must never be responsible
for expensive computation. It exists only for: Authentication, User
accounts, Workspace/Project/Target/Note metadata, Findings metadata,
Activity timeline, Team collaboration, API keys, Preferences, Reports
metadata, Synchronization, Notifications, RBAC, and Audit logs.

All computationally expensive work — Recon and Vulnerability tool
execution, AI inference, local storage, file indexing, voice processing,
local RAG, and report/PDF/Markdown/DOCX generation — runs in a new
**Desktop Agent** (Tauri preferred; Electron acceptable only if a
required capability has no workable Tauri equivalent), targeting
Windows, Linux, and macOS.

Key rules that follow from this:

* Private target/finding/evidence data never leaves the user's machine
  unless the user explicitly opts into sync.
* AI never requires PentestHub's own API keys — every user brings their
  own provider (OpenAI, Anthropic, Gemini, OpenRouter, Ollama, LM Studio,
  DeepSeek, Mistral, Groq, Azure OpenAI), defaulting to local Ollama with
  no key, and degrading gracefully (never crashing) if Ollama is also
  unavailable.
* Voice is local-first (Web Speech API primary; Whisper.cpp/Piper TTS as
  Desktop Agent fallbacks) — cloud TTS/STT is optional, never required.
* RAG is local only (SQLite+embeddings or LanceDB) — no mandatory cloud
  vector database, no private data uploaded without opt-in.
* Sync is user-selectable: Off / Metadata-Only (default) / Everything.
* Offline mode works for workspace/projects/notes/findings/recon/
  scanning/reports/local AI/voice/search.
* Free tier is unlimited for everything that runs locally (Projects,
  Targets, Recon, Scans, Reports, Markdown/PDF export, Local AI, Voice,
  the Desktop Agent itself). Premium unlocks only Cloud Sync, Team
  Collaboration, Cloud Backup, Advanced Analytics, Priority Queue,
  Organization Features, and Enterprise Integrations — users never pay to
  scan locally.

This principle is being retrofitted onto Modules 1-6 via a phased,
strangler-fig migration (see the roadmap doc) that preserves existing
API contracts and does not break the current web UI. As of this writing,
**no migration code has shipped yet** — Modules 3-6 still execute tool
runners, AI calls, RAG, voice, and report rendering server-side, tracked
as violations to fix in the roadmap's phases. See the audit doc's
module-by-module findings for specifics.

---

# Target Users

* Bug Bounty Hunters
* Penetration Testers
* Red Teamers
* Security Engineers
* Students
* CTF Players
* SOC Analysts
* DevSecOps Engineers

---

# Platforms

Build everything from a single codebase where possible.

Required:

* Responsive Website
* Progressive Web App (PWA)
* Android Application
* iOS Application
* Windows Desktop
* macOS Desktop
* Linux Desktop

Prefer Flutter for mobile/desktop and a modern web framework for the web.

---

# Authentication

Support:

* Google OAuth
* GitHub OAuth
* Email Registration
* Login
* Remember Me
* Email Verification
* Password Reset
* Change Password
* MFA / Two-Factor Authentication
* Session Management
* Device Management

---

# User Dashboard

Each user has:

* Personal Workspace
* Saved Payloads
* Saved Notes
* Saved Reports
* Saved Targets
* Saved Recon Data
* Saved CVEs
* Saved Tools
* Recent Activity
* Favorites
* API Keys
* Notification Center

---

# AI Assistant

> Note: Built as **Module 5 — AI Security Copilot** — **Phase 1 and Phase 2
> both done** (backend "brain": workspace/project-aware chat with
> automatic context gathering, RAG over pgvector, a 5-provider
> abstraction — OpenAI, Anthropic, Gemini, Ollama, OpenRouter —
> switchable by configuration with no keys wired yet, an editable
> prompt-module architecture, tool calling — search findings/recon/
> evidence/notes/projects/targets/templates, create note, draft report,
> generate PoC, generate payloads — SSE token streaming with
> cancel/regenerate/continue, prompt-injection guardrails, and strict
> workspace/project isolation; frontend: `/ai` dashboard with
> conversation history, context indicator, suggested questions, streaming
> chat, Markdown rendering). **Phase 2** (the "UX layer") adds: Voice
> Interaction (Web Speech API mic input + text-to-speech message
> playback, plus a backend `SpeechProvider` abstraction with 4
> unconfigured cloud adapters — OpenAI, Azure, Google, ElevenLabs — same
> "ships complete, wired later" posture as the chat providers), a Smart
> Code Block toolbar (language badge, one-click download, wrap toggle,
> expand/collapse, fullscreen view), One-Click Code/Conversation Export
> (per-message download plus whole-conversation Markdown export), Terminal
> Mode (a monospace/dark toggle view for the whole conversation), Artifact
> Mode (a dedicated side panel for substantial generated content — PoCs,
> payload sets, draft reports — decoupled from the chat bubble), and
> Interactive Canvas (pannable/zoomable Mermaid diagram rendering for
> ```mermaid blocks — attack chains, network topology). See
> `docs/adr/0005-ai-security-copilot-module.md` for the full decision
> record and phasing rationale.

Integrate a powerful AI assistant.

The AI must understand cybersecurity.

Capabilities:

* Explain vulnerabilities
* Explain CVEs
* Generate payloads
* Analyze Burp requests
* Analyze HTTP responses
* Analyze Nmap output
* Analyze Nikto output
* Analyze ffuf output
* Analyze nuclei output
* Generate exploit ideas
* Explain exploit chains
* Create pentest reports
* Explain code
* Analyze JavaScript
* Decode JWT
* Decode Tokens
* Explain APIs
* Suggest next attack surface
* Help with CTFs
* Summarize writeups

Never hallucinate technical facts. Clearly distinguish verified facts from suggestions.

---

# Voice Assistant

> Note: Built as part of Module 5's AI Security Copilot, Phase 2. A
> `SpeechProvider` backend interface (apps/api/src/modules/ai/speech/)
> with 5 adapters — WEB_SPEECH (a documented client-side marker, always
> "configured") plus 4 real, unconfigured-until-keyed cloud adapters
> (OpenAI Whisper+TTS, Azure Speech, Google Speech, ElevenLabs TTS-only),
> surfaced via `GET /ai/speech/providers`. The only backend actually
> reachable today is the frontend's own Web Speech API integration
> (apps/web/features/ai/hooks/use-ai-voice.ts): a mic button appends
> recognized speech into the chat input (SpeechRecognition), and a
> Speak/Stop Speaking message action reads assistant replies aloud
> (speechSynthesis) — both degrade to hidden buttons on browsers without
> support (e.g. Firefox has no SpeechRecognition) rather than erroring.
> See `docs/adr/0005-ai-security-copilot-module.md`.

Support speech recognition.

Users can say:

"Analyze this request."

"Generate XSS payload."

"Explain this CVE."

"Open Recon."

"Create report."

"Search CVE."

Support voice replies where available.

---

# Pentesting Workspace

Provide projects.

Each project contains:

Targets

Subdomains

Notes

Screenshots

Payloads

Credentials

Reports

Timeline

Bookmarks

Files

Tasks

Collaborators

---

# Recon Module

Include:

WHOIS

DNS

Subdomain Enumeration

ASN Lookup

Technology Detection

HTTP Headers

robots.txt

sitemap.xml

Wayback URLs

Security Headers

TLS Analysis

Directory Discovery

Port Information

Fingerprinting

Visual Screenshots

---

# Vulnerability Tools

> Note: "Module 4" in the rollout order below was redefined by the project
> owner into the **Vulnerability Engine** (external scanner orchestration —
> Nuclei/ffuf/dirsearch/feroxbuster/Nikto — producing validated Findings; see
> `docs/adr/0004-vulnerability-engine-module.md`), not the client-side
> payload/encoder toolbox described in this section. The toolbox below
> remains an unimplemented, unscheduled idea, kept here for future reference.

Include:

Reverse Shell Generator

Payload Generator

SQL Injection Payloads

XSS Payloads

SSTI Payloads

Command Injection Payloads

LFI Payloads

RFI Payloads

XXE Payloads

SSRF Payloads

JWT Decoder

JWT Editor

JWT Generator

Hash Identifier

Hash Generator

Password Generator

URL Encoder

URL Decoder

Base64

Hex

Binary

Unicode

Regex Tester

JSON Formatter

XML Formatter

YAML Formatter

HTTP Formatter

Cookie Parser

Request Parser

Response Parser

Header Analyzer

CSP Analyzer

CORS Analyzer

JWT Cracker (only for authorized testing)

Wordlist Generator

Fuzz Helper

---

# Bug Bounty Workspace

Support:

Target Notes

Scope Tracking

Program Notes

Recon Notes

Custom Checklist

Evidence

Screenshots

Findings

Severity Calculator

CVSS Calculator

Timeline

Submission History

Templates

Duplicate Detection

Markdown Editor

---

# Report Generator

Generate professional reports.

Support:

PDF

Markdown

HTML

DOCX

Executive Summary

Technical Details

Risk Rating

Mitigation

Screenshots

Evidence

CVSS

OWASP Mapping

CWE Mapping

---

# Knowledge Base

Include searchable resources for:

OWASP

HackTricks

Payload references

Cheat Sheets

Ports

Protocols

HTTP Status Codes

Linux Privilege Escalation

Windows Privilege Escalation

Active Directory

Cloud Security

Web Security

API Security

Mobile Security

Wireless Security

Cryptography

Reverse Engineering

Malware Analysis

Red Team

Blue Team

MITRE ATT&CK

---

# CVE Center

Provide:

CVE Search

Filters

CVSS

Affected Products

References

Exploit Links

Patch Status

Vendor Links

Timeline

---

# Integrations

Support integrations with services such as:

GitHub

Google Drive

Discord

Slack

Webhook endpoints

Email notifications

Calendar reminders

---

# UI/UX

Modern dark-first interface.

Responsive.

Fast.

Keyboard shortcuts.

Command Palette.

Global Search.

Dockable panels.

Resizable layouts.

Professional dashboards.

---

# Security

Use:

JWT with refresh tokens

Rate limiting

CSRF protection

CSP

Input validation

Secure headers

Encrypted secrets

Audit logging

Role-based access control

Secure file uploads

Session expiration

Account lockout after repeated failures

---

# Admin Panel

Manage:

Users

Reports

Subscriptions

Feature flags

Analytics

Logs

Announcements

Support tickets

System health

API usage

---

# Future Features

Team collaboration

Shared workspaces

Private organizations

Marketplace

Plugin SDK

Extension system

Browser extension

CLI tool

Public REST API

GraphQL API

Offline mode

AI automation workflows

---

# Code Quality

Produce production-ready code.

Use clean architecture.

Use modular design.

Follow SOLID principles.

Write tests.

Document APIs.

Avoid duplicated code.

Ensure accessibility.

Optimize for performance and maintainability.

Every feature should be designed so that additional tools and integrations can be
added without major refactoring.

---

# Build Process (binding rule)

Never write the entire project at once. Always:

1. Plan first.
2. Build exactly one module at a time.
3. Finish a module (production-ready, tested, documented) before starting the next.
4. Every module must ship with tests and documentation before being considered done.

---

# Locked Architecture Decisions

These decisions were made explicitly with the project owner and take precedence
over the open-ended "prefer X" language above where they conflict.

| Area | Decision |
|---|---|
| Repo structure | Monorepo (Turborepo) at `~/pentesthub-ai` |
| Web frontend | Next.js (React, TypeScript) |
| Backend API | Node.js / NestJS (TypeScript) |
| Mobile/Desktop | Flutter (deferred until web core is stable) |
| First module | Auth (email + Google/GitHub OAuth) + Dashboard shell |

## Monorepo layout (actual, as of scaffold)

```
pentesthub-ai/
├── PROJECT_SPEC.md
├── turbo.json
├── pnpm-workspace.yaml
├── apps/
│   ├── web/                    # Next.js 16 (React 19, TS) frontend
│   └── api/                    # NestJS 11 (TS) backend
├── packages/
│   ├── shared/                 # shared types / DTOs (@pentesthub/shared)
│   ├── ui/                     # shared design system / components (@pentesthub/ui)
│   ├── eslint-config/          # shared eslint flat configs (@pentesthub/eslint-config)
│   └── typescript-config/      # shared tsconfig bases (@pentesthub/typescript-config)
└── docs/
    └── modules/                # per-module design docs, ADRs
```

Package manager: pnpm (workspaces). Task runner: Turborepo (`build`, `lint`,
`check-types`, `test`, `dev` pipelines all verified working end to end).

## Module rollout order (subject to revision after each module ships)

1. Auth (Module 1) — **done** (NestJS API: register, email verification,
   login, logout, JWT + refresh-token rotation with reuse detection,
   argon2 password hashing, forgot/reset/change password, Google/GitHub
   OAuth, TOTP MFA + backup codes, RBAC foundation, session/device
   management, audit logging, rate limiting, Swagger docs, seed data.
   See `docs/modules/01-auth.md` and `docs/adr/0001-auth-module.md`).
2. Workspace Foundation + Dashboard UI (Module 2) — **done** (backend:
   Workspaces, Projects, Targets, Notes, Evidence, Attachments, Tags,
   event-driven Activity Timeline, Search — all domain-agnostic storage,
   no Recon/AI logic attached; frontend: full Next.js dashboard covering
   Module 1 auth UI plus every Module 2 resource, Settings, command
   palette, dark-mode-first responsive shell. See
   `docs/adr/0002-workspace-foundation-module.md`).
3. Recon Module (Module 3) — **done** (backend: 14 tools — Subfinder,
   Amass, Assetfinder, HTTPX, Katana, Gau, Waybackurls, DNSx, Naabu, Nmap,
   WhatWeb, Gowitness, WHOIS, ASN lookup — behind one `ToolRunner`/
   `Normalizer` abstraction, a distributed-worker-safe job queue with
   atomic claiming/retry/cancel/orphan-sweep, a polymorphic `ReconFinding`
   model with dedup-key + unique-constraint deduplication, "Promote
   Finding to Target," SSE live logs; frontend: job list/detail/progress/
   findings UI integrated into the target and project pages plus a
   workspace-wide `/recon` landing page. See
   `docs/adr/0003-recon-engine-module.md`).
4. Vulnerability Engine (Module 4) — **done**. Redefined from this
   document's original "Vulnerability Tools" placeholder (a client-side
   encoder/payload-generator toolbox) into a full scanner-orchestration
   engine per explicit direction from the project owner: Recon Assets →
   Scan Jobs → external scanners (Nuclei, ffuf, dirsearch, feroxbuster,
   Nikto behind one `ScannerRunner`/`Normalizer` abstraction, extension
   points reserved for SQLMap/XSStrike/Dalfox/Wapiti/OWASP ZAP) →
   normalized `VulnFinding`s (severity/CVSS/CWE/OWASP category, dedup-key
   + unique-constraint deduplication, auto-attached text Evidence) → Scan
   Queue with Pause/Resume/Cancel/Retry/Priority/Worker Heartbeat/Dead
   Worker Recovery → Activity Timeline → events reserved for a future AI
   hook. The original "Vulnerability Tools" payload/encoder toolbox this
   section used to describe is not built and isn't currently on the
   roadmap under that name; the encoder/JWT/hash-utility items listed
   above this section remain unimplemented client-side utilities, not
   part of Module 4. See `docs/adr/0004-vulnerability-engine-module.md`.
5. Bug Bounty Workspace (Module 6) — **done**. Merges this document's
   original "Bug Bounty Workspace" and "Report Generator" placeholders into
   one module, the same way Module 4 absorbed "Vulnerability Tools":
   Programs (platform/status/rules/severity-matrix/disclosure policy) with
   a Scope Manager (9 scope-item types, IPv4 CIDR/range auto-classification,
   OUT_OF_SCOPE-wins-over-IN_SCOPE), a Program Importer (HackerOne/Bugcrowd/
   Intigriti/Markdown/JSON), a read-through Asset Inventory over Targets +
   Recon/Vuln findings + Notes/Evidence (no new storage), a Finding
   Lifecycle stage machine (New → Triaged → Verified → Reported → Resolved
   → Closed → Archived, plus Duplicate/Need More Info side-branches), a Bug
   Report Generator (one persisted report rendered into 5 platform
   templates, PDF/Markdown/HTML/JSON/CSV export) with an AI Report Draft
   Assistant and lexical+semantic Duplicate Detection (both reusing Module
   5's AI seam), a Payload Library (16 categories, seed + custom entries,
   AI explain), a Personal Knowledge Base, Bookmarks, a Dashboard +
   Statistics view, a Calendar with a self-scheduling deadline-notifier
   poller, Notifications, and Global Search — plus this codebase's first
   use of optimistic locking (on `BugReport.version`). Frontend: 11 pages
   under `/bugbounty`. See `docs/adr/0006-bug-bounty-workspace-module.md`
   and `docs/releases/module-6-release-notes.md`.
6. AI Assistant integration (Module 5) — **Phase 1 and Phase 2 done**.
   Built as the "AI Security Copilot": workspace/project-aware AI Chat
   with automatic context gathering (no manual pasting), a RAG layer over
   pgvector (per-workspace/per-project isolated memory), a 5-provider
   abstraction (OpenAI/Anthropic/Gemini/Ollama/OpenRouter — switchable by
   config, no keys wired yet per explicit direction), an editable
   prompt-module architecture (system/security/recon/finding-analysis/
   report/coding, never hardcoded in controllers), a provider-agnostic
   tool-calling framework (search findings/recon/evidence/notes/projects/
   targets/templates, create note, draft report, generate PoC, generate
   payloads) built to be extended by future modules without touching the
   chat engine, SSE token streaming with cancel/regenerate/continue,
   prompt-injection guardrails, and workspace/project isolation enforced
   on every command/query. Frontend: `/ai` dashboard (conversation
   history, context indicator, suggested questions, streaming chat,
   Markdown rendering). **Phase 2** adds the "UX layer": Voice Interaction
   (Web Speech API mic input + speak-aloud replies, backed by a
   `SpeechProvider` abstraction with 4 unconfigured cloud adapters), a
   Smart Code Block toolbar (language badge, download, wrap, expand/
   collapse, fullscreen), One-Click Code/Conversation Export, Terminal
   Mode, Artifact Mode (a dedicated side panel for substantial generated
   content), and Interactive Canvas (pannable/zoomable Mermaid diagrams).
   See `docs/adr/0005-ai-security-copilot-module.md`.
7. CVE Center
8. Knowledge Base (workspace-wide/cross-project — distinct from Module 6's
   per-user Personal Knowledge Base, which is done)
9. Admin Panel
10. Integrations, Voice Assistant, Mobile/Desktop (Flutter), Marketplace/Plugin SDK

> **Local-first migration status** (2026-07-16): per the Local-First Core
> Principle above, Modules 3-6 as described in this list still execute
> server-side today. Module 3's 14 tool runners and Module 4's 5 scanner
> runners are slated to move entirely into the new Desktop Agent (backend
> keeps only job/result metadata, history, activity, and stats). Module
> 5's provider execution currently uses server-configured keys (a
> violation, fixed first in the migration's Phase 1), and its RAG
> (pgvector) and voice (cloud speech adapters) are slated to move to a
> local vector store and Whisper.cpp/Piper respectively. Module 6's Bug
> Report template rendering is slated to move client-side (Markdown/HTML/
> PDF/DOCX generated locally, only report metadata synced); its AI Draft
> Assistant and semantic Duplicate Detection inherit Module 5's move. Item
> 10's "Mobile/Desktop (Flutter)" placeholder is superseded by the Tauri
> Desktop Agent decision in ADR 0007 for the desktop portion specifically
> (mobile remains open). Full detail: `docs/migration/local-first-architecture-migration.md`,
> `docs/adr/0007-local-first-desktop-agent-architecture.md`,
> `docs/migration/desktop-agent-roadmap.md`.
>
> **Module 7 — Desktop Agent** (2026-07-19): source-complete. The Tauri
> desktop app at `apps/desktop` now has its own Local Tool Runner (16
> tools), Background Job Queue, local SQLite database, Sync Engine
> (Off/Metadata-Only/Everything, conflict resolution, retry queue,
> multi-workspace), Local AI (9 providers, streaming, tool calling), Local
> RAG (FTS5 + embeddings, fully offline), Voice (Web Speech API +
> whisper.cpp/Piper fallback), File Manager/Evidence Library (SHA-256
> dedup, Folder Watch), Report Generator (PDF/MD/HTML/DOCX/TXT/JSON/ZIP,
> all local), a full Desktop AI Chat, a Plugin Manager (Nmap/Burp/ZAP/
> Metasploit/Custom Script), and Settings/Auto-Update/Security. This
> fulfills the "Modules 3/4/6 move client-side" migration items described
> above. Not yet compiled/runtime-verified — see
> `docs/modules/07-desktop-agent.md`'s "Verification handoff" section.
>
> **Module 8 — Browser Extension + Burp Suite Integration** (2026-07-20):
> source-complete. A new Local Bridge Server
> (`apps/desktop/src-tauri/src/bridge/`) gives the Module 7 Desktop
> Agent a real `127.0.0.1`-only, bearer-token-authenticated,
> AES-256-GCM-encrypted HTTP+WebSocket API, since Tauri's `invoke()` IPC
> is unreachable from outside its own webview. A Manifest V3 Browser
> Extension (`apps/browser-extension`, Chrome/Edge/Brave/Opera + a
> Firefox build) talks to it for Target Capture (19 one-click actions),
> Recon Shortcuts (7), an AI Side Panel (11 quick actions, streaming
> Markdown/Mermaid/voice), a DevTools panel (8 tabs), a 12-category/
> 35-entry Payload Library, 6-format Export, and Bug Bounty scope import
> (HackerOne/Bugcrowd/Intigriti/YesWeHack/Synack). A Burp Suite extension
> (`extensions/burp`, Jython/legacy Extender API — Community + Pro
> compatible) adds the same capture/finding/AI-context actions from
> Burp's context menu. Sensitive-data capture (cookies, storage,
> tokens) requires explicit confirmation, enforced both client-side and
> server-side. Live Sync keeps the current Project/Target/Conversation
> in sync across the desktop app, browser, and Burp via a WS ping + REST
> snapshot protocol. Not yet compiled/runtime-verified (no browser, Burp
> Suite, or completed `npm install` in the build environment) — the
> pure-logic TypeScript modules and the cross-language AES-256-GCM/HKDF
> crypto *were* independently verified via direct Node execution; see
> `docs/modules/08-browser-extension.md`'s "Verification handoff"
> section and `docs/adr/0008-browser-extension-burp-integration.md`.
>
> **Module 9 — Bug Bounty Platform + Collaboration + Reporting Suite**
> (2026-07-20): source-complete.
> Extends Module 6's per-hunter workflow into a full team platform: a
> multi-platform Program Manager (favorite/safe-harbor/rate-limits) with
> an update-detecting Program Importer (SHA-256 fingerprint + human-
> readable diff, never destructively reclassifies existing scope on
> reimport), Scope Manager asset-type/status extensions, a Finding
> Manager with a real CVSS 3.1 calculator plus CWE/CAPEC/OWASP/MITRE
> ATT&CK mapping, a Report Builder with custom templates, AI grammar
> correction and technical review, and a TXT export (DOCX disclosed as
> unimplemented — no document-generation dependency installed); a new
> Collaboration layer (workspace invites, 3 new roles slotting between
> ADMIN and MEMBER, comments with @mentions, assignments, task lists, a
> read-through activity feed); 7 new Bug Bounty Dashboard widgets; an AI
> Bug Bounty Assistant (9 capabilities — review/payloads/PoC/repro/
> impact/remediation/severity/attack-paths/engagement-summary, all
> "propose, don't auto-apply"); Knowledge Base entry kinds (playbooks,
> CVE references, tool references, AI conversation snapshots) plus
> tagging; scheduled Automation jobs; multi-channel Notifications
> (Discord/Slack/Telegram/custom API/webhook/email — email disclosed as
> unimplemented, no provider configured) with AES-256-GCM-encrypted
> channel secrets; a filterable Analytics rollup distinct from Module 6's
> Statistics; Global Search extended to AI chats/tags/tasks; a Public
> REST API (personal/workspace API keys, HMAC-signed webhooks, rate
> limiting, OpenAPI); and a security-hardening pass that closed a
> plaintext-secret gap on `WebhookToken`/`NotificationChannelConfig`,
> fixed two pre-existing `AuditEventType` import bugs, added the missing
> `WORKSPACE_MEMBER_*` audit-trail writes, and documented the full
> Permission Matrix. Frontend and a full `apps/api` typecheck/test run
> were not independently re-verified in the sandbox this module was built
> in (the same environment constraint noted for Modules 7-8); all changes
> were reviewed by hand against the exact repository-interface signatures
> they call, and `packages/shared`'s typecheck was re-run clean after
> every shared-type change. See `docs/adr/0009-bug-bounty-operating-system.md`,
> `docs/modules/09-bug-bounty-operating-system.md`, and
> `docs/security/permission-matrix.md`.
>
> **Module 10 — Enterprise Platform + SaaS + Global Infrastructure**
> (2026-07-22): source-complete. The largest module by scope to date —
> fourteen subsystems: real multi-tenant `Organization`/`Team` above the
> existing `Workspace` boundary (additive, doesn't replace it); a
> Postgres-native claim-based Distributed Job System (no new message
> broker); a Plugin Marketplace with a permission-acceptance model
> (sandboxing is contractual today, not a separate execution runtime —
> disclosed follow-up before accepting untrusted third-party plugins); an
> Integrations framework routing every provider action through one
> generic executor; Team Workspaces; Enterprise Reporting/Analytics
> reusing Module 6/9's rendering patterns; a full API Platform (GraphQL,
> an expanded real webhook delivery pipeline with retry/backoff/dead-
> letter, and TypeScript/Python/Go SDKs — a cross-reference audit mid-
> module caught and fixed several drifted fields in the Go SDK); a
> Workflow Automation Engine (nine step kinds, real integration with
> Reporting/Notifications/AI/Integrations, not stubs); Compliance
> (retention enforcement, backup snapshots, a GDPR export pipeline — a
> mid-implementation privacy bug that would have leaked cross-user audit
> data was caught and fixed before shipping); Observability (Prometheus
> metrics, OpenTelemetry tracing, structured logging, health checks); High
> Availability (every Module 9/10 background poller — seven services — is
> now safe at any replica count via a new Postgres-row-based distributed
> lease, closing a previously-documented single-replica limitation);
> Security Hardening (a Content-Security-Policy fix that would otherwise
> have broken Swagger UI in any deployment that enabled it, plus HSTS/
> clickjacking headers); CI/CD (GitHub Actions — lint/typecheck/test/build,
> Docker image publishing, CodeQL + dependency audit — the first
> environment in this project's history with an actual Go toolchain,
> finally compiling the Go SDK for real); and four Production Deployment
> paths (Docker Compose, Kubernetes with autoscaling, Linux systemd,
> Windows Services) documented with an explicit accounting of what's
> genuinely production-hardened by the application itself versus what
> remains a deployment-specific responsibility (Postgres itself has no
> built-in HA in any of these paths — call it out before treating this as
> a solved problem). `packages/shared` was re-verified clean
> (`tsc --noEmit`) after every shared-type change; a full `apps/api`
> typecheck could not complete within this sandbox's command timeout, and
> the newly-added `@opentelemetry/*` tracing dependencies were never
> `pnpm install`'d here (no registry network access) — both disclosed,
> consistent with the same environment constraint noted for Modules 7-9.
> Every file was manually re-verified after editing, including a direct
> cross-check of Prisma field names against `schema.prisma` rather than
> assumed. `ci.yml` is the first real, automated verification pass this
> code will receive — treat it as authoritative. See
> `docs/adr/0010-enterprise-platform.md`,
> `docs/modules/10-enterprise-platform.md`,
> `docs/releases/module-10-release-notes.md`, and `deploy/README.md`.
>
> **Module 11 — AI Security Copilot + Autonomous Multi-Agent System**
> (2026-07-26): source-complete. Adds a **Master AI Orchestrator**
> (`AgentOrchestratorService`) on top of Module 5's existing single-turn AI
> chat: a free-text goal is decomposed into a tree of `AgentTask`s,
> delegated across twelve specialist agents (Recon, Web, API, Mobile,
> Cloud, Active Directory, AI Research, Exploit Analysis, Report Writer,
> Code Review, Risk Assessment, Workflow Coordinator — the last able to
> delegate further sub-tasks), executed with dependency ordering, bounded
> concurrency, automatic retry, and a self-evaluation critique pass before
> completion — sharing Module 5's provider abstraction and tool-calling
> framework rather than forking them. Alongside the orchestrator: a
> searchable AI Knowledge Base (OWASP/CWE/CAPEC/MITRE ATT&CK/NIST/CVE, opt-
> in semantic reindex into the existing RAG store); an Explainability layer
> (pure aggregation of already-persisted reasoning/confidence/evidence into
> one "why did the system conclude this" narrative — no new persisted
> concept); per-workspace Privacy Mode (`CLOUD`/`LOCAL`/`HYBRID`) enforced
> at the provider-resolution seam every AI/agent call passes through
> (disclosed as narrower than ADR 0007's full local-first definition — it
> restricts provider choice, not execution location); four performance
> fixes from a dedicated review pass (an SSE fast path, a batched
> tool-call-log query fixing two independent N+1s, an invalidate-on-write
> Knowledge Base cache, a batched memory-chunk insert); a new
> `AgentRunsController`/`KnowledgeBaseReferencesController` HTTP surface
> (list/create/get/cancel/retry/explain a run, plus a live `@Sse()`
> progress stream mirroring Module 5's chat-stream pattern exactly) — the
> first way for a human user or the frontend to reach the orchestrator at
> all, previously only an internal Workflow Automation step could; and a
> new `/agent` + `/knowledge-base` frontend surface, deliberately kept
> separate from Module 5's existing `/ai` chat page since a multi-agent
> orchestration run has a fundamentally different shape than a chat turn.
> `packages/shared` and a full `apps/api` project-wide `tsc --noEmit` +
> `eslint` pass both completed and stayed clean this module — the first
> module since 6 where that full backend verification loop actually ran to
> completion in this sandbox (via a detached-background-process technique
> that works around the environment's foreground command timeout). The
> identical technique did not reproduce for `apps/web` or for Jest later in
> the same session; both were instead verified by direct manual
> cross-reference against the real shared DTOs and call signatures, which
> caught and fixed one real type error (a tuple-inference bug in the new
> Knowledge Base page). Five new Jest spec files were added to the `agent`
> module (previously zero) and a pre-existing, since-stale
> `ai-provider-registry.service.spec.ts` was found and rewritten to match
> this module's async, privacy-mode-aware provider resolution. See
> `docs/adr/0011-ai-security-copilot-multi-agent-system.md`,
> `docs/modules/11-ai-security-copilot-multi-agent-system.md`, and
> `docs/releases/module-11-release-notes.md`.
>
> **Module 12 — Cross-Platform Mobile Application (Flutter)** (2026-07-28):
> source-complete. Adds `apps/mobile`, a Flutter app (Clean Architecture,
> feature-first, Riverpod, GoRouter, Dio, Hive + sqflite) joining `apps/web`
> and `apps/desktop` as a third first-class client of `apps/api`, covering
> Auth (full Module 1 integration: email/Google/GitHub, MFA, refresh-token
> rotation, biometrics/PIN device lock, secure token storage), Dashboard,
> offline-first Projects/Targets/Findings (a shared `SyncEngine`/outbox
> pattern — offline writes apply optimistically to a local sqflite row and
> sync on reconnect via a per-entity `SyncPushHandler`), Reports, an AI
> Security Copilot screen (Module 11 integration: streaming chat over a
> hand-rolled SSE client since Flutter has no built-in `EventSource`,
> Markdown/syntax-highlighted code/Mermaid rendering, voice push-to-talk,
> Master Orchestrator run tracking, Knowledge Base search), Voice
> (on-device STT/TTS), Notifications, Evidence Capture (camera/gallery/
> file/video/mic/QR, on-device SHA-256 hashing, offline upload queue), File
> Manager, Global Search (online + an offline FTS5 fallback), Settings
> (incl. Module 11 Privacy Mode), Workspace, Analytics (`fl_chart`), and
> security hardening (encrypted storage, certificate pinning, jailbreak/
> root detection, clipboard auto-clear, session timeout, remote logout).
> Deliberately avoids Freezed/riverpod_generator/json_serializable codegen
> in favor of Dart 3 native `sealed class` state unions, since the
> authoring sandbox had no reachable Flutter/Dart toolchain at all
> (`storage.googleapis.com`, where the Flutter engine/Dart SDK are hosted,
> is blocked by the network allowlist) — every file was hand-authored and
> manually cross-referenced against real `packages/shared` contracts
> instead of compiler-verified, a stricter constraint than any prior
> module faced, and one disclosed in full in ADR 0012 §8. Manual review
> still caught and fixed three self-authored bugs (a malformed color hex
> literal, a `ProviderContainer` double-construction bug in `main.dart`'s
> bootstrap, and a data-mapping typo in the Analytics bar chart). `android/`
> and `ios/` contain only hand-authored `AndroidManifest.xml`/`Info.plist`
> partials — the Gradle/Xcode native scaffold must be generated on a real
> machine via `flutter create --platforms=android,ios .` before this module
> builds at all, and `flutter analyze`/`flutter test`/`flutter build` have
> not been run against this source. See
> `docs/adr/0012-mobile-application.md`,
> `docs/modules/12-mobile-application.md`,
> `docs/releases/module-12-release-notes.md`,
> `docs/mobile/mobile-architecture-guide.md`,
> `docs/mobile/flutter-development-guide.md`, and
> `docs/mobile/api-integration-guide.md`.
>
> **Module 13 — AI Automation Platform + MCP Ecosystem + Security Agent
> SDK** (2026-08-06): source-complete. Adopts the **Model Context Protocol**
> (`2025-06-18`) as the platform's extensibility substrate: a standards-
> compliant MCP server (`POST /mcp/rpc` — `initialize`/`tools/list`/
> `tools/call`/`resources/list`/`resources/read`/`prompts/list`/
> `prompts/get`, API-key + scope-scoped sessions) exposing 15 tools (every
> one dispatching an existing `CommandBus`/`QueryBus` handler, no parallel
> logic), 13 read-only resource types, and Module 11's Prompt Registry;
> and a dependency-free `McpClient` (`@pentesthub/sdk`) making the
> platform an MCP consumer too. On top of that: an **AI Agent SDK**
> (`packages/agent-sdk`) with eleven built-in prompt-specialist agents
> (Recon, Web Pentest, API Security, Cloud Security, AD Assessment, Code
> Review, Threat Modeling, Bug Bounty Assistant, Report Writer, Knowledge
> Curator, Workflow Agent — all instances of one shared factory, not
> bespoke classes) plus a `CUSTOM` agent kind; **Workflow Builder**
> extensions to Module 10's engine (`parallel`/`approval`/MCP-tool-call
> steps, `WEBHOOK`/`EVENT` triggers) and a matching **Event Bus**
> expansion; a **Plugin SDK** (`node:vm` hook sandboxing, confirmed-real
> Ed25519 code signing) and **Script Engine** (sandboxed JavaScript with a
> real wall-clock timeout race, a capability-gated `pentesthub.*` global,
> PYTHON rejection) sharing one hardened untrusted-code execution
> primitive; an **Automation Marketplace** (the existing Plugin
> Marketplace, now also listing Agent SDK/Script/Workflow artifacts);
> **Local Execution** (a relay queue letting the backend or an external
> MCP client ask a user's Desktop Agent/Browser Extension to run something
> locally); **AI Evaluation** (scores agent/tool/script output against a
> metric catalog); six new **Observability** Prometheus series plus a
> `GET /observability/ai-platform` dashboard aggregating every Module 13
> automation surface; a **Developer Portal** (browsable catalog, a real
> "try it" tool-call endpoint, a usage dashboard — regular JWT REST, not
> an MCP session); and `packages/cli` (`@pentesthub/cli`), a
> dependency-free CLI built entirely on the existing SDK/shared contracts.
> A real, pre-existing bug was found and fixed during the Tests pass:
> `MetricsRegistryService`'s `Histogram.render()` was double-cumulating
> already-cumulative bucket counts, silently corrupting every Prometheus
> histogram this codebase exposes (including the Module 10 HTTP-duration
> series) — caught by hand-deriving expected values for a new histogram
> test. `packages/shared` was re-verified clean (`tsc --noEmit`) after
> every shared-type change, and `packages/cli` — small and freestanding —
> was independently verified via a manual `node_modules` symlink to
> sibling workspace packages plus a direct `tsc --noEmit`, a genuine clean
> compile; `apps/api`'s ~970-file project remained too slow to fully
> typecheck or Jest-test in this sandbox (the same constraint disclosed in
> every module since Module 7 — no `pnpm` binary and no registry access
> here either), so every `apps/api` edit was manually cross-checked
> against already-verified sibling files instead, and three new Jest spec
> files were written and reasoned through by hand rather than executed.
> See `docs/adr/0013-ai-automation-platform-mcp-ecosystem.md`,
> `docs/modules/13-ai-automation-platform-mcp-ecosystem.md`,
> `docs/releases/module-13-release-notes.md`, and `docs/mcp/mcp-guide.md`.
