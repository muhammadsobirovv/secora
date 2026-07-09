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
3. Recon Module (WHOIS/DNS/subdomain enum/tech fingerprinting)
4. Vulnerability Tools (encoders/decoders/JWT/payload generators — no external deps)
5. Bug Bounty Workspace (targets, scope tracking, findings)
6. Report Generator
7. AI Assistant integration
8. CVE Center
9. Knowledge Base
10. Admin Panel
11. Integrations, Voice Assistant, Mobile/Desktop (Flutter), Marketplace/Plugin SDK
