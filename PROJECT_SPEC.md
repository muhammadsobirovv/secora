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
   enco