# GDPR Readiness

Module 15 (task #343) foundation document. This ties together the technical
capability that already exists across two earlier pieces of work and gives
operators a single place to point their own compliance documentation at:

- **Module 10's Compliance module** (`apps/api/src/modules/compliance/`) —
  org-level, admin-triggered: configurable `DataRetentionPolicy` per resource
  type with automatic enforcement, `BackupPolicy` snapshots, and
  `ComplianceExportRequest` — an async, org-wide data export a workspace
  Admin+ can request (`POST /enterprise/organizations/:id/compliance/exports`).
- **Module 15 task #342's Privacy controls**
  (`apps/api/src/modules/auth/{use-cases,controllers}/`) — per-account,
  self-service: `GET /auth/privacy/data-export` and
  `POST /auth/privacy/delete-account`, plus telemetry opt-out via
  `PATCH /users/me/preferences`.
- **This task's static reference API** —
  `GET /compliance/gdpr/overview` (`apps/api/src/modules/compliance/controllers/gdpr.controller.ts`)
  serves the data processing register and data-subject-rights table below as
  JSON, generated from a single source of truth in
  `packages/shared/src/gdpr.ts`.

PentestHub AI is self-hostable software, not a hosted service Anthropic-style
company operates on your behalf. That means **the deployment operator is the
data controller** for their instance, and this document is written for that
operator — it explains what the platform gives you out of the box, and what
remains your responsibility as the controller.

## Data processing register (GDPR Article 30-style)

The authoritative version of this table is served live at
`GET /compliance/gdpr/overview` (field: `dataProcessingRegister`) and defined
in `packages/shared/src/gdpr.ts` — update that file, not this table, if the
platform's data categories change.

| Category | Examples | Purpose | Lawful basis | Retention | Storage location |
|---|---|---|---|---|---|
| Account & authentication | email, password hash, MFA factors, session/device metadata | Account creation, authentication, session security | Contract | Until account deletion | Primary database, operator's chosen region |
| Security & audit events | login/logout events, IP address, user agent, MFA events | Security monitoring, abuse prevention, incident investigation | Legitimate interests | Per-org `DataRetentionPolicy` where configured; unbounded otherwise | Primary database |
| Billing & usage | subscription plan, invoices, usage counters, payment provider customer id | Subscription billing, quota enforcement | Contract | Per applicable tax/accounting law | Primary database + configured payment provider (e.g. Stripe) |
| AI conversations | chat messages, AI-generated findings/report drafts | Delivering the AI security copilot | Contract | Workspace-scoped, until deleted | Primary database (CLOUD/HYBRID) or entirely on-device (LOCAL) — see AI privacy mode |
| Workspace content | findings, reports, scan results, attachments/evidence | Core platform functionality | Contract | Workspace-scoped, per `DataRetentionPolicy` | Primary database + configured object storage |
| Telemetry (optional) | feature usage counts, error diagnostics | Product improvement, only if not opted out | Consent | Aggregated where possible | Operator-configured telemetry endpoint; can be disabled entirely |

## Data subject rights — how they're exercised on this platform

| Right | Article | How |
|---|---|---|
| Access | Art. 15 | `GET /auth/privacy/data-export` (self, own account) or an org Admin via `POST /enterprise/organizations/:id/compliance/exports` |
| Erasure | Art. 17 | `POST /auth/privacy/delete-account` — soft-deletes the account (see that endpoint's doc comment for exact scope; it is not a full hard-erasure pipeline across every workspace-scoped table) |
| Portability | Art. 20 | `GET /auth/privacy/data-export` returns structured JSON |
| Rectification | Art. 16 | Account/profile settings |
| Restriction / objection | Art. 18, 21 | **Manual procedure** — see below, not yet a self-service action |
| Withdraw consent (telemetry) | Art. 7 | `PATCH /users/me/preferences` with `{ telemetryOptOut: true }` |

### Manual procedure for restriction/objection requests (Art. 18/21)

There is no self-service UI for this yet. Until one exists, an operator
receiving such a request should: (1) identify every workspace the account is
a member of, (2) coordinate with each workspace's owner to pause automated
processing of that member's contributions where feasible (e.g. exclude their
AI conversation history from any batch AI training/analysis jobs — the
platform does not currently run any by default), and (3) document the request
and its resolution in your own case-tracking system, since the platform does
not yet track restriction/objection requests as first-class records.

## Breach notification

The platform does not automate breach notification — this is inherently an
operator responsibility that depends on jurisdiction, severity, and your own
incident response plan. What the platform gives you to support that process:

- The `AuditEvent` log (queryable per-account via the same data export
  machinery, and in bulk via direct database access) for reconstructing
  who-did-what-when around a suspected incident.
- Module 14's observability/logging stack (structured JSON logs, correlation
  IDs, security/slow-query logs — see `docs/architecture/` and
  `docs/security/`) for infrastructure-level forensics.

Under GDPR, a personal data breach must generally be reported to the relevant
supervisory authority within 72 hours of the controller becoming aware of it
(Art. 33), and to affected data subjects directly if it's likely to result in
a high risk to their rights and freedoms (Art. 34). Build your own runbook
around those two deadlines — the platform can't do this for you since it
doesn't know your jurisdiction or your users' legal residency.

## Cross-border data transfers

PentestHub AI is self-hosted: **the operator picks the deployment region**,
so there's no platform-mandated cross-border transfer to begin with. The only
transfers the platform introduces on its own are opt-in:

1. The configured payment provider (e.g. Stripe) for billing, if billing is
   enabled.
2. A cloud AI provider (OpenAI, Anthropic, Gemini, OpenRouter) — only if a
   workspace's AI privacy mode is set to `CLOUD` or `HYBRID`. Setting it to
   `LOCAL` keeps AI processing entirely on-device and avoids this transfer.

If your regulatory environment requires Standard Contractual Clauses or
another transfer safeguard for either of those, that's between you and the
third-party provider you've chosen — check their own DPA/SCC documentation.

## What this platform does *not* claim to be

This document, the `/compliance/gdpr/overview` endpoint, and the self-service
export/deletion endpoints in task #342 are a **foundation**, not a
certification. They do not constitute legal advice, and standing this
infrastructure up does not by itself make a deployment GDPR-compliant — that
depends on how the operator configures retention policies, who they share
data with, their own organizational processes, and jurisdiction-specific
requirements this document can't anticipate. Consult qualified legal counsel
for your specific deployment.

## Known gaps (honest disclosure)

- No self-service UI exists yet for restriction/objection requests (Art. 18/21) — manual procedure only, above.
- Account deletion (task #342) is a soft status flip, not a hard-erasure/anonymization pipeline across every workspace-scoped table.
- No `ConsentRecord` model exists — the platform does not track granular, timestamped consent beyond the single `telemetryOptOut` boolean and standard account creation (implicitly a contract-basis signup, not consent-basis).
- No Data Protection Officer contact mechanism is built into the product; operators who are legally required to designate one should publish that contact through their own channels (e.g. alongside `SECURITY.md`, task #346).
