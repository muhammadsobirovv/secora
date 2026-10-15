# Security Policy

Secora AI is a penetration-testing and bug-bounty platform — the kind
of software where the people running it are, by definition, unusually
capable of finding and exploiting security bugs in it. We'd rather hear
about a problem from you, privately, than find out about it from a public
exploit. This document explains how.

## Reporting a vulnerability

**Please do not open a public GitHub issue for a security vulnerability.**
Public issues are for bugs and feature requests, not for anything that
could be used to attack a live deployment before a fix ships.

Instead, use one of these private channels:

1. **Preferred: GitHub Security Advisories.** Go to this repository's
   **Security** tab → **Report a vulnerability**. This opens a private
   advisory only the maintainers can see, supports attaching proof-of-concept
   files/screenshots, and lets us coordinate a fix and a public disclosure
   date with you directly in the same thread — no separate email
   back-and-forth needed. *(Repository-owner note: this option only
   appears once "Private vulnerability reporting" is turned on under
   Settings → Code security for this repository — like the Dependabot
   settings referenced in `docs/security/supply-chain.md`, it's a
   per-repository toggle this file can describe but can't enable for
   you.)*
2. **Email**: if you don't have (or don't want to use) a GitHub account,
   email **[security@secora.group](mailto:security@secora.group)**.
   This inbox is monitored and is also published in
   [`/.well-known/security.txt`](https://secora.group/.well-known/security.txt)
   (RFC 9116). *(Forking or self-hosting this project? Replace it with an
   inbox you actually monitor — an unmonitored security contact is worse
   than none, because it gives a false sense of a working reporting
   channel.)*

### What to include

The more of this you can provide, the faster we can reproduce and fix the
issue:

- The affected component (`apps/api`, `apps/web`, `apps/desktop`,
  `apps/mobile`, a specific module, a browser extension, the Burp
  extension, an SDK) and, if known, the specific file/endpoint.
- Steps to reproduce, or a proof-of-concept request/script.
- What you expected vs. what actually happened, and why it's a security
  issue (not just a bug) — e.g. "this lets user A read user B's data
  without authorization" is more actionable than "this seems wrong."
- Your assessment of impact (what an attacker could actually do with it),
  if you have one — we'll form our own view too, but yours helps us
  triage faster.
- Whether you're aware of it being exploited in the wild.

### What to expect from us

- **Acknowledgment within 5 business days** of a report through either
  channel above.
- We'll work with you to understand and reproduce the issue, and keep you
  updated as we investigate and fix it. Response and fix timelines depend
  on severity and complexity — we don't promise a fixed SLA for every
  report, but we do promise to keep communicating rather than going quiet.
- **Coordinated disclosure**: we ask that you give us a reasonable window
  to ship a fix before any public disclosure (blog post, talk, tweet,
  public advisory). We're happy to agree on a specific date with you
  up front rather than leaving it open-ended, and we'll credit you (unless
  you'd prefer to stay anonymous) in the eventual GitHub Security Advisory
  and release notes.

## Scope

**In scope**: the code in this repository — `apps/api`, `apps/web`,
`apps/desktop`, `apps/mobile`, `packages/*` (including the CLI, Python SDK,
Go SDK), `extensions/*` (browser extension, Burp extension), and the
GitHub Actions workflows / Docker/Kubernetes deployment templates under
`.github/` and `deploy/`.

**Out of scope**:
- Vulnerabilities that require an attacker to already have your database
  credentials, your `JWT_ACCESS_SECRET`, or root/administrator access to
  your host — that's a compromised deployment, not a vulnerability in this
  software. See `docs/security/secrets-management.md` for what's actually
  meant to be kept secret.
- Third-party services this platform can be configured to call out to
  (Stripe, OpenAI/Anthropic/Gemini/OpenRouter, Slack, GitHub, etc.) — report
  those to the respective vendor.
- Findings that only apply to a deliberately-disclosed limitation already
  written down in this codebase's own docs (e.g. `docs/reviews/`,
  `docs/security/`, or a file's own doc comment) — those aren't secret, and
  we'd rather you spend your time on something we don't already know
  about. If you disagree with how we've scoped or prioritized a disclosed
  gap, that's still worth telling us, just through a normal issue/discussion
  rather than a private report.
- Social engineering, physical attacks, or denial-of-service attacks that
  just consume resources rather than exploiting a specific flaw (rate
  limiting exists — see `docs/security/` — but "I can send a lot of
  requests" isn't on its own a new finding).

If you're not sure whether something is in scope, report it anyway through
the private channels above and let us make that call — we'd rather triage
a false positive than miss a real one.

## Supported versions

Secora AI reached its first stable release at `1.0.0` (see
`CHANGELOG.md`). `RELEASE_CHANNEL` (stable/beta/nightly, task #356)
remains informational only, not a formal support-tier distinction.
**Only the latest `1.x` release and the latest commit on `main` are
supported** — there is no long-term-support line for `0.x` versions,
since those predate the stability guarantees `1.0.0` establishes. If
you're running an older commit, an older `0.x` release, or a fork that
has diverged, please reproduce against current `main` or the latest
`1.x` tag before reporting, since we can only meaningfully fix and
verify against what's actually there today. Per-module release notes
live in `docs/releases/`.

## Our own security posture, documented

This project already documents a fair amount of its own security design
and known limitations in the open — reviewing these first may answer your
question, or help you write a sharper report:

- `docs/security/` — secrets management, TLS/mTLS & certificate rotation,
  WAF compatibility, the permission matrix, and supply-chain security
  (dependency scanning, SBOM, container signing, plugin integrity
  verification).
- `docs/reviews/` — dedicated architecture/security/performance review
  documents written at several points in this project's development,
  including `0003-final-security-review.md` (platform-wide, Modules 1-10),
  `0008-m15-security-hardening-review.md` and
  `0011-module-15-security-review-followup.md` (Module 15's own added
  surfaces, including the Stripe webhook and feature flags) — all list
  concrete findings, what was fixed, and what remains open with rationale.
- `PRIVACY.md` and `docs/compliance/gdpr-readiness.md` — data processing,
  retention, and data-subject-rights posture.
- Individual doc comments throughout the codebase, especially on anything
  described as "v1 scope," "disclosed gap," or "deferred" — this project's
  convention is to write down a deliberate security/scope tradeoff in the
  code itself, not just in a document that can drift out of sync with it.

## Recognition

We don't currently run a paid bug bounty program. We will credit
reporters (with permission) in the fix's GitHub Security Advisory and
release notes, and we're glad to write a reference/recommendation for a
well-handled disclosure if that's useful to you.
