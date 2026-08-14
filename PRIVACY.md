# Privacy Policy

PentestHub AI is self-hosted, open-source software: this file ships as
**a template a deployment operator adapts**, not a policy Anthropic-style
company enforces on your behalf. If you're reading this from the source
repository (not from a specific operator's deployment), treat it as the
default posture the software implements — the actual controller for any
given deployment is whoever runs it.

For the detailed, article-by-article GDPR mapping (data processing
register, data-subject-rights procedures, breach notification, cross-border
transfers), see `docs/compliance/gdpr-readiness.md`. This document is the
shorter, plain-language version meant to be read by an end user, not a
compliance officer.

## Who controls your data

**The organization or individual who deployed this instance** — not the
authors of this software. PentestHub AI can be self-hosted with zero
external accounts and zero data leaving the operator's own infrastructure
(see "What never leaves your deployment" below); when that's how an
instance is run, there is no third party in the loop at all besides the
operator you're already trusting by using their instance.

## What we collect and why

| Data | Why | Optional? |
|---|---|---|
| Account info (email, password hash, MFA factors) | Authenticate you, secure your session | No — required to have an account |
| Security & audit events (login/logout, IP, user agent) | Detect abuse, investigate incidents | No — this is a security control, not a preference |
| Workspace content (findings, reports, scan results, evidence, AI conversations) | The actual product — this is what you're using the platform to create | No, but retention is governed by your organization's `DataRetentionPolicy` if one is configured |
| Billing & usage (plan, invoices, usage counters) | Only relevant if your deployment has billing enabled (`BILLING_PROVIDER != none`) | Yes — most self-hosted deployments never enable this |
| Telemetry (feature usage counts, error diagnostics) | Product improvement | **Yes, and off by default** — `UserPreferences.telemetryOptOut` starts `false`-collecting only if an operator explicitly turns telemetry on for their deployment; you can opt out per-account at any time via `PATCH /users/me/preferences` |

We do not sell data, and there is no advertising system in this product
to sell it to.

## What never leaves your deployment (unless you turn it on)

- **AI processing**: every workspace has an AI privacy mode. `LOCAL` keeps
  AI inference entirely on-device (Desktop Agent) — nothing about your
  prompts, findings, or conversations reaches a cloud AI provider.
  `CLOUD`/`HYBRID` are opt-in per workspace and send the relevant context
  to whichever provider (OpenAI, Anthropic, Gemini, OpenRouter, or your
  own BYOK key) that workspace has configured.
- **Billing**: `BILLING_PROVIDER` defaults to `none`. No payment provider
  is contacted, and no billing data leaves your deployment, unless an
  operator explicitly configures Stripe.
- **Telemetry**: off by default at the platform level; even where an
  operator enables it, any individual user can opt out.
- **Everything else** (scans, recon, reports, chat history, evidence) —
  stored in your deployment's own database and object storage, wherever
  the operator chose to run those.

## Your rights over your own data

- **See what we have**: `GET /auth/privacy/data-export` returns a
  structured export of your account data. An organization Admin can also
  request a full org-wide export via the Compliance module.
- **Delete your account**: `POST /auth/privacy/delete-account`. Disclosed
  honestly: this is a soft-delete of your account status today, not a
  hard-erasure/anonymization pass across every workspace-scoped table your
  contributions touched (a finding you wrote in a shared workspace isn't
  retroactively scrubbed from that workspace's history). See
  `docs/compliance/gdpr-readiness.md`'s "Known gaps" section for the exact
  scope and what's still manual.
- **Opt out of telemetry**: `PATCH /users/me/preferences` with
  `{ "telemetryOptOut": true }`.
- **Object to or restrict processing**: no self-service action exists for
  this yet — it's a manual procedure your deployment operator handles
  today (see `docs/compliance/gdpr-readiness.md`).

## Cookies and similar technologies

The web app uses session/auth tokens necessary for you to stay logged in.
It does not embed third-party advertising or cross-site tracking scripts.
If an operator enables telemetry, that telemetry is first-party (sent to
an endpoint the operator configures), not a third-party ad-tech pixel.

## Children's privacy

This platform is a professional security-testing tool and is not directed
at, or knowingly used by, children. It has no age-gating mechanism of its
own — an operator deploying this for an audience where that matters is
responsible for adding one.

## Changes to this policy

Because this is a template shipped in an open-source repository, changes
to it happen the same way any other code change does — via `CHANGELOG.md`
and this repository's normal review process. An operator running a
customized fork should maintain their own copy reflecting what their
specific deployment actually does, and should tell their users when it
changes.

## Contact

Replace this with your deployment's actual contact address. The upstream
project's placeholder is `privacy@pentesthub.ai` — same caveat as
`SECURITY.md`'s `security@pentesthub.ai`: an unmonitored address is worse
than none, so point this at an inbox you actually read.

## Related documents

- `docs/compliance/gdpr-readiness.md` — the detailed, article-by-article
  GDPR mapping this document summarizes.
- `SECURITY.md` — how to report a security vulnerability (different from
  a privacy question).
- `docs/security/secrets-management.md` — what's technically kept secret
  and how.
- `docs/adr/0015-production-hardening-monetization-marketplace.md` —
  the architectural decisions behind this module's privacy/telemetry work.
