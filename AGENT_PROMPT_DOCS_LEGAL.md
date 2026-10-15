Task: (A) trim the public /docs site to user-facing content, (B) add legal pages, (C) add versioned legal acceptance at signup/login, (D) add a per-target authorization attestation before scans, with audit logging. Work in small commits, single author (the user), NO Co-Authored-By trailers. Do not put any personal email anywhere; contact addresses are support@pentesthubai.com and security@pentesthubai.com. Run build/lint/typecheck/tests, then deploy and verify.

## A. Public /docs: keep only user-facing content
The docs site is generated from the repo `docs/` folder. Currently it exposes ADRs, ~33 internal audits/reviews ("Final Security Review", "Grep Sweep", "task #344", "Module 20 Phase 25-39"), release notes and module guides. Change the docs loader/manifest to use an explicit ALLOWLIST (not a blocklist) so new internal files are never published by accident.

Publicly visible sections (new, user-facing, write real content in en; uz and ru can follow in the i18n pattern the app already uses, or at minimum en + a note):
1. Getting Started: what PentestHub AI is, create account, first workspace, add first target.
2. Scanning guide: recon, vulnerability scans, reading findings, severity, exporting.
3. Bug Bounty workflow: import program/scope, track findings, build a report.
4. AI Copilot: what it can/can't do, BYOK keys, privacy (cloud/local/hybrid).
5. Rules of Engagement & Responsible Use (short practical guide, links to the legal pages).
6. API / SDK / CLI quick reference (link to existing OpenAPI if public).
7. Security: Vulnerability Disclosure Policy (from SECURITY.md, contact security@pentesthubai.com).
8. FAQ / Troubleshooting.

Everything else (ADRs, reviews/audits, release notes, module guides, migration, mobile/dev guides) stays in the repo but is NOT published on the site and not in sitemap.xml. Remove their routes (return 404), update sitemap, keep /docs/start/security-policy working or redirect it to the new Security page. Check robots/sitemap afterwards and make sure no removed URL stays in the sitemap.

## B. Legal pages (public, no login), in en/uz/ru, footer-linked
- /legal/terms (Terms of Service)
- /legal/acceptable-use (Acceptable Use Policy + Rules of Engagement)
- /legal/privacy (Privacy Policy)
- /security (Vulnerability Disclosure Policy; also keep /.well-known/security.txt)
Each page shows "Version X, effective <date>" taken from a single source of truth constant (see C). Use the draft text below as the base, marked clearly in code comments as "DRAFT: requires review by a qualified Uzbekistan lawyer before launch".

Key content for Terms/AUP (rewrite into proper prose):
1. The platform is for AUTHORIZED security testing only. You may test only assets you own, or for which you hold explicit, written, current authorization from the owner (contract, signed Rules of Engagement/ROE, or a bug bounty program's published scope/safe harbor).
2. You must stay inside the authorized scope, time window, and methods. Anything outside the ROE or program scope is prohibited.
3. If you test outside the ROE/scope or without authorization, you act entirely at your own risk and assume full legal responsibility (civil, administrative and criminal) for your actions. PentestHub AI provides tooling only, does not verify authorization on your behalf (except where a verification feature is enabled), and is not liable for how you use it.
4. Prohibited: unauthorized access, DoS/stress testing without explicit written permission, data exfiltration beyond proof-of-concept, social engineering/phishing of third parties, targeting critical infrastructure, government or military systems without written authorization, testing third-party services you merely use, using the platform for extortion or malware.
5. We may suspend/terminate accounts, cooperate with lawful requests from authorities, and keep audit records (acceptance logs, scan authorization logs) for abuse investigation.
6. Indemnification clause, limitation of liability, governing law = Republic of Uzbekistan (lawyer to confirm), contact addresses.
7. Users are responsible for their own legal compliance in the country where they and their targets are located.

Privacy policy must cover: data collected (account, workspace, targets, scan results, audit logs), purposes, retention, processors (OAuth providers, AI providers when BYOK/cloud mode is used), user rights (access/rectify/delete), contact, and a statement about where data is stored.

## C. Versioned legal acceptance (signup + login)
Data model (Prisma migration):
- `LegalDocument`-style constants in code: `LEGAL_VERSION` (e.g. "2026-10-06") for Terms+AUP+Privacy combined.
- `LegalAcceptance { id, userId, version, documents (terms|aup|privacy), acceptedAt, ipAddress, userAgent }`, indexed by userId+version, append-only.
Behavior:
- Signup (email and OAuth Google/GitHub first login): unchecked checkbox "I have read and agree to the Terms of Service, Acceptable Use Policy and Privacy Policy, and I confirm I will only test systems I own or am explicitly authorized to test. If I act outside an agreed ROE/scope, I accept full responsibility." Links open in new tab. Signup is blocked until checked. Server must enforce it too (not only the UI).
- Login: if the user's latest accepted version != current `LEGAL_VERSION`, redirect to a blocking "Updated terms" screen after authentication; every API route except logout/accept must return 403 `LEGAL_ACCEPTANCE_REQUIRED` until accepted. Existing users are treated as not accepted and see the screen at next login.
- Store acceptance with IP (respect trusted-proxy setup) and user agent. Add to audit log.
- Add i18n strings in en/uz/ru; keep message files in sync.
- Tests: signup without acceptance fails; version bump forces re-acceptance; API gate returns 403; acceptance row is created once per version.

## D. Per-target / per-scan authorization attestation (most important layer)
Legal responsibility arises at scan time, so login acceptance alone is not enough.
- When creating a Target (and when a Program scope is imported) require an `authorizationBasis`: one of `OWNER` (I own it), `WRITTEN_PERMISSION` (client contract / ROE; optional document reference/notes field), `BUG_BOUNTY_SCOPE` (asset is in-scope for the linked program). Plus a required checkbox attestation: "I own this asset or have current written authorization; I will stay inside the authorized scope."
- Before starting any ACTIVE recon/vulnerability scan, check the target has a valid attestation (not expired; allow user-set optional expiry, default 12 months). If missing or expired, block with a clear error and prompt to attest. Passive recon may be allowed without attestation if it only queries public sources; document the decision.
- Block obviously forbidden targets by default for active scanning: private/internal IP ranges via the hosted service (reuse the existing SSRF/network-guard centralization), localhost, cloud metadata addresses, and a configurable denylist (e.g. *.gov.uz, *.mil.uz, *.edu.uz? -> make this a configurable list defaulting to government/military TLDs; owners can request allow-listing via support).
- Every attestation and every scan start writes an immutable audit record: userId, workspaceId, target, basis, version of the attestation text, timestamp, IP.
- Optional phase 2 (design the schema so it can be added, do NOT build now): domain ownership verification (DNS TXT `pentesthub-verify=<token>` or `/.well-known/pentesthub-verify.txt`). Verified targets would get the strongest status; unverified targets would be limited to passive recon.
- Tests: scan blocked without attestation; blocked after expiry; private IP/localhost blocked; audit rows written; bug-bounty scope import satisfies the attestation.

## E. Verification
- `git grep -iE "@gmail\.com"` must return nothing that is a personal address.
- Visit /docs and confirm only the user-facing sections exist; removed URLs 404; sitemap has no removed URLs.
- Visit /legal/terms, /legal/acceptable-use, /legal/privacy, /security in en/uz/ru.
- Signup flow and re-acceptance screen work in a real browser (desktop and mobile width), no console errors.
- Report what was changed and list any placeholders that need legal review.
