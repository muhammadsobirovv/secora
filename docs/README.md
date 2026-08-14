# PentestHub AI — Documentation Index

Module 15, task #350. A single table of contents over every document in
this repository, organized the same way `apps/web`'s `/docs` portal
groups them (see `apps/web/lib/docs-content.ts` — that page is generated
directly from these folders, so this file and the web portal should never
drift out of sync in terms of *which files exist*; this file adds the
human-curated framing/ordering, the portal adds live rendering + search
surface area for the web app).

If you're reading this from the running application rather than a git
checkout, the same content is browsable at `/docs`.

## Getting Started

- [`PROJECT_SPEC.md`](../PROJECT_SPEC.md) — the living product/technical spec for the whole platform.
- [`README.md`](../README.md) — repo overview, local setup.
- [`SECURITY.md`](../SECURITY.md) — vulnerability disclosure policy.

## Architecture Decision Records (`docs/adr/`)

One ADR per module, capturing the "why" behind its design:

- [0001 — Auth module](adr/0001-auth-module.md)
- [0002 — Workspace foundation module](adr/0002-workspace-foundation-module.md)
- [0003 — Recon engine module](adr/0003-recon-engine-module.md)
- [0004 — Vulnerability engine module](adr/0004-vulnerability-engine-module.md)
- [0005 — AI security copilot module](adr/0005-ai-security-copilot-module.md)
- [0006 — Bug bounty workspace module](adr/0006-bug-bounty-workspace-module.md)
- [0007 — Local-first desktop agent architecture](adr/0007-local-first-desktop-agent-architecture.md)
- [0008 — Browser extension + Burp integration](adr/0008-browser-extension-burp-integration.md)
- [0009 — Bug bounty operating system](adr/0009-bug-bounty-operating-system.md)
- [0010 — Enterprise platform](adr/0010-enterprise-platform.md)
- [0011 — AI security copilot multi-agent system](adr/0011-ai-security-copilot-multi-agent-system.md)
- [0012 — Mobile application](adr/0012-mobile-application.md)
- [0013 — AI automation platform / MCP ecosystem](adr/0013-ai-automation-platform-mcp-ecosystem.md)
- [0014 — Cloud platform / enterprise SaaS HA](adr/0014-cloud-platform-enterprise-saas-ha.md)

## Architecture (`docs/architecture/`)

Cross-cutting system design, not tied to a single module:

- [API Gateway](architecture/api-gateway.md)
- [Auto-Update](architecture/auto-update.md)
- [CI/CD](architecture/ci-cd.md)
- [i18n (English / Uzbek / Russian)](architecture/i18n.md)

## Module Guides (`docs/modules/`)

What each numbered module implements, status, and how to exercise it:

- [Module 1 — Auth](modules/01-auth.md)
- [Module 7 — Desktop Agent](modules/07-desktop-agent.md)
- [Module 8 — Browser Extension](modules/08-browser-extension.md)
- [Module 9 — Bug Bounty Operating System](modules/09-bug-bounty-operating-system.md)
- [Module 10 — Enterprise Platform](modules/10-enterprise-platform.md)
- [Module 11 — AI Security Copilot / Multi-Agent System](modules/11-ai-security-copilot-multi-agent-system.md)
- [Module 12 — Mobile Application](modules/12-mobile-application.md)
- [Module 13 — AI Automation Platform / MCP Ecosystem](modules/13-ai-automation-platform-mcp-ecosystem.md)
- [Module 14 — Cloud Platform / Enterprise SaaS HA](modules/14-cloud-platform-enterprise-saas-ha.md)

(Modules 2–6 don't have a standalone module doc — see their ADRs and
release notes below instead.)

## Security (`docs/security/`)

- [Permission matrix](security/permission-matrix.md)
- [Secrets management](security/secrets-management.md)
- [Supply chain security](security/supply-chain.md)
- [TLS/mTLS & certificates](security/tls-mtls-certificates.md)
- [WAF compatibility](security/waf-compatibility.md)

## Compliance (`docs/compliance/`)

- [GDPR readiness](compliance/gdpr-readiness.md)

## Mobile (`docs/mobile/`)

- [Mobile architecture guide](mobile/mobile-architecture-guide.md)
- [Flutter development guide](mobile/flutter-development-guide.md)
- [API integration guide](mobile/api-integration-guide.md)

## Migration Guides (`docs/migration/`)

- [Local-first architecture migration](migration/local-first-architecture-migration.md)
- [Desktop agent roadmap](migration/desktop-agent-roadmap.md)

## MCP & Integrations (`docs/mcp/`)

- [MCP guide](mcp/mcp-guide.md)

## Reviews & Audits (`docs/reviews/`)

- [0001 — Module 1 architecture review](reviews/0001-module-1-architecture-review.md)
- [0002 — Final architecture review](reviews/0002-final-architecture-review.md)
- [0003 — Final security review](reviews/0003-final-security-review.md)
- [0004 — Final performance review](reviews/0004-final-performance-review.md)
- [0005 — Final production readiness report](reviews/0005-final-production-readiness-report.md)
- [0006 — Module 14 performance review](reviews/0006-module-14-performance-review.md)
- [0007 — Module 14 Community Edition guarantee](reviews/0007-module-14-community-edition-guarantee.md)
- [0008 — M15 security hardening review](reviews/0008-m15-security-hardening-review.md)
- [0009 — Accessibility audit](reviews/0009-accessibility-audit.md)

## Release Notes (`docs/releases/`)

- [Module 2](releases/module-2-release-notes.md)
- [Module 4](releases/module-4-release-notes.md)
- [Module 5, Phase 1](releases/module-5-phase-1-release-notes.md)
- [Module 5, Phase 2](releases/module-5-phase-2-release-notes.md)
- [Module 6](releases/module-6-release-notes.md)
- [Module 9](releases/module-9-release-notes.md)
- [Module 10](releases/module-10-release-notes.md)
- [Module 11](releases/module-11-release-notes.md)
- [Module 12](releases/module-12-release-notes.md)
- [Module 13](releases/module-13-release-notes.md)
- [Module 14](releases/module-14-release-notes.md)

## Reading this online

The same set of documents, minus this index page itself, is served at
`/docs` in the web app (`apps/web/app/docs/`) — grouped identically,
rendered as HTML with syntax highlighting, generated at build time from
this exact folder structure (see `apps/web/lib/docs-content.ts`). No
separate content to maintain: add a `.md` file under one of the
directories above (or add a new directory + register it in
`DOC_CATEGORIES`) and both this index and the web portal pick it up on
the next build.
