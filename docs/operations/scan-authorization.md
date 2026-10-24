# Scan authorization: "I own it" and "I'm testing for a client"

An active scan sends real requests to a website. Secora only runs one when it
has a reason to believe the person asking is allowed to. There are two ways to
give that reason, and the second one adds a human on the other side.

This page describes the model, how it is enforced, what each path does and does
not prove, and the limits an operator should know about. The pentest tools and
profiles are described in [pentest-tools.md](./pentest-tools.md).

## The two paths

| | **I own it** | **I'm testing for a client** |
|---|---|---|
| Proof | A DNS TXT record (recommended), a file under `/.well-known/`, or a meta tag, each carrying a per-target random token | The client's mailbox approves a request that names the assets, the test window and who is asking |
| Who decides | Whoever controls the DNS zone or the web server | Whoever can read the client's mailbox and clicks "Approve" |
| Covers | The verified host. Subdomains too, but only with the DNS method (it proves control of the zone) | Exactly the listed assets. Subdomains only where the client allowed the wildcard for that asset |
| Lasts | Until the target is deleted | Until the end of the test window, or until the client withdraws |
| Scan types | All profiles the deployment enables | `VULN_SCAN` only |

Both paths still go through the same checks that never change: the scope engine,
the active-scan network guard (no private, loopback, link-local or metadata
addresses; the government/military denylist), DNS pinning, the pinning proxy and
the per-scan scope guard. **Nothing on this page weakens any of them.**
`ACTIVE_SCAN_ALLOW_PRIVATE_TARGETS` stays `false` in production, and an approved
engagement does not change that.

## The gate

`TargetAuthorizationService.assertActiveScanAllowed` is called for every active
scan by every caller (REST, AI tools, MCP). The order is:

1. If the operation is a vulnerability scan and the user does **not** already have
   a valid attestation plus verified ownership for the target, look for an
   `ACTIVE` engagement that belongs to this user and workspace, whose window
   contains *now*, and that covers the target.
2. If one exists: run the **network guard** (always), audit `ROE_SCAN_AUTHORIZED`,
   and return an authorization whose `roeId` is set.
3. Otherwise the original path runs unchanged: attestation, network guard,
   verified ownership.

Verified ownership wins when the user has both. An engagement is never consulted
for recon or any other operation type.

`CreateVulnScanJobHandler` writes the returned `roeId` into the job's config. A
`roeId` supplied by a caller (through `config` or a template) is always dropped
first, so the only way to run under an engagement is for the gate to have just
approved it.

## Enforcement during a scan

An engagement can end while a scan is queued or running (the client withdraws,
the window closes, the requester cancels). It is therefore re-checked, not
trusted once:

- **Job creation.** The gate above.
- **Worker start.** `VulnScanJobExecutionService` calls
  `RoeCoverageService.assertStillValid(roeId, target)` before anything is
  resolved or run. Reasons that fail the job: `REVOKED`, `EXPIRED`, `NOT_YET`,
  `NOT_COVERED`, `NOT_ACTIVE` (cancelled, declined), `MISSING`.
- **Before every stage.** The pipeline orchestrator asks the host
  `authorizationLost()` before each stage.
- **During a stage.** While the pipeline runs, a watcher re-checks every 15
  seconds. If the authorization is gone it aborts the stage's signal, so a long
  tool run is interrupted instead of finishing.
- **Fail closed.** If the check itself errors (for example the database is
  unreachable), the scan stops with a message saying the authorization could not
  be re-checked.

When a scan stops this way the job ends as `FAILED` with a clear message
("The client withdrew their approval…", "The test window … ended…"). Findings
already saved are kept, the report is available and marked partial, and
`ROE_SCAN_STOPPED` is written to the audit log with the reason.

### Scope under an engagement

The scope rule for the scan comes from the engagement, not from an ownership
proof: the covering asset's host, plus its subdomains **only** if the client
approved the wildcard for that asset. A URL asset covers its own host only and
never subdomains. Every host or URL found by subfinder, dnsx, katana, ffuf and
the rest goes through the same `partitionByScope` / `ScopeGuard` as an
owner-proved scan: names outside the rule are dropped and logged, lookalikes
(`acme.example.evil.test`, `evilacme.example`) never match, and anything that
resolves to a private address is refused. An IP address that is only *discovered*
(never named by the user) is not a target: ports are only scanned on addresses
that belong to in-scope names.

### What an engagement does not unlock

- **DEEP.** It still needs `SCAN_DEEP_PROFILE_ENABLED` on the deployment and an
  explicit `confirmDeep` from the user. The interface never offers it.
- **IP addresses and CIDR ranges.** Not supported in this version. They are
  rejected when the request is made and never match at scan time.
- **Private or internal targets.** Unchanged: refused by the network guard.
- **Other users.** Only the person who made the request can scan under it.

## The request

The requester gives:

- the client's name and a **contact email**;
- the scope: up to 20 assets, each a `DOMAIN`, `SUBDOMAIN` or `URL`, with a
  wildcard flag per asset (default off; a URL never carries it);
- the test window (start and end, at most 90 days; the start may be up to an hour
  in the past or 60 days ahead);
- the signatory's name and role;
- optionally, evidence of the written authorization;
- a checkbox taking responsibility for the authorization being genuine, linked to
  the Acceptable Use Policy.

**The email rule.** The contact's domain must equal the registrable domain of
*every* asset, or be a subdomain of it. Free-mail providers, a list of
disposable-mail domains, public suffixes and the requester's own account email are
refused. This stops a requester approving their own request from an address they
control.

**Evidence.** A signed PDF, a PNG or JPEG image, or a saved `.eml`, up to 10 MB.
The type is decided from the file's own bytes (magic numbers; an `.eml` must be
named so and start with a mail header). SVG, HTML and anything else are refused.
The file is stored under a random key (`roe/<id>/<random>`) with its SHA-256, and
is only ever served as a download (`Content-Disposition: attachment`,
`X-Content-Type-Options: nosniff`, a sandboxing CSP), never inline.

Once sent, the scope and window cannot be edited. To change them the requester
makes a new request.

### Limits

| Limit | Value |
|---|---|
| Requests waiting for a client, per user | 5 |
| Approval emails per user per hour | 10 |
| Approval emails per recipient address per day | 3 |
| Resend cooldown | 10 minutes |
| Approval link lifetime | 7 days |
| Assets per request | 20 |
| Window | 90 days |

Counts come from stored email events, so they hold across restarts and several
API instances. The public endpoints are also rate-limited per IP by the global
throttler.

## The approval link

- The token is 256 bits of randomness (`roe_` + 43 base64url characters). Only its
  SHA-256 is stored.
- **Opening the link changes nothing.** The page loads the request with a `GET`;
  *Approve* and *Decline* are separate `POST`s. A mail scanner or link preview
  that fetches the URL cannot approve.
- The decision is one atomic update that only matches a request that is still
  `PENDING`, whose link is unused and unexpired and whose window has not ended.
  Two simultaneous clicks produce exactly one decision.
- Time, IP address and user agent are recorded for the decision.
- A used, expired, replaced, cancelled or invented link gets the same answer
  ("This link is no longer valid."), so a guesser learns nothing.
- Sending the email again **replaces** the token; the old link stops working.
- Approving creates a second token, the **revoke token** (also stored hashed,
  single use), and mails it to the client in the confirmation message. Revoking
  is another `POST` from a page opened by that link. The requester is told by
  email whenever the client approves, declines or withdraws.

The approval email states who is asking (name and account email), the
organisation, the exact assets, whether the wildcard is on, the window, and what
to do if the request was not expected. Everything a user typed is reduced to one
line, length-capped and HTML-escaped; there is a plain-text part as well as HTML.
The audit log records the recipient's *domain*, never the full address.

Statuses: `PENDING`, `ACTIVE`, `DECLINED`, `EXPIRED`, `REVOKED`, `CANCELLED`.
`EXPIRED` is computed when read (an `ACTIVE` row past its window end, or a
`PENDING` one whose link ran out); nothing depends on a background job flipping
it, because every enforcement point checks the dates itself.

## What an approval does NOT prove

Be precise about this when you explain the feature to a customer or an auditor.

- It proves that **someone who can read that mailbox clicked a button**. It does
  not prove who they are, and it does not prove they have the authority to speak
  for the organisation. The email-domain rule only shows the mailbox belongs to
  the same domain as the assets.
- A compromised mailbox, a shared mailbox or a forwarded link approves just as
  well as the right person.
- The signatory name and role are what the *requester typed*. Secora does not
  verify them.
- The uploaded evidence is **stored, not validated**. Nobody reads the PDF
  automatically; it is there for a later dispute.
- The registrable-domain check uses a **bundled list of two-label public
  suffixes** (`co.uk`, `com.au`, …), not the full Public Suffix List. A suffix
  missing from the list is treated as a single label, which makes the check
  stricter for that suffix, but unusual registries can still be handled less
  precisely than a full list would. Update the list in `roe-rules.ts` if you
  serve customers under such a registry.
- Ownership of a *domain* is not ownership of everything behind it: a hosting
  provider, a CDN or a SaaS platform may have its own terms that the client cannot
  waive. That is between the requester and the client.
- If the confirmation email (which carries the revoke link) is lost, the client
  cannot withdraw by link and must contact the requester or
  `support@secora.group`. The requester can always end an authorization from the
  Authorizations page; doing so stops running scans at their next check.

The requester takes responsibility for the authorization being genuine when they
send the request (checkbox, recorded with a timestamp), under the Acceptable Use
Policy.

## Threat notes

| Threat | Mitigation |
|---|---|
| Requester approves their own request | The contact's domain must match the assets; free-mail, disposable and the requester's own address are refused |
| Link prefetched by a mail scanner | Approval needs a `POST`; `GET` is read only |
| Link guessed or replayed | 256-bit random token, hashed at rest, single use, 7 days, uniform error |
| Link forwarded | Same as any bearer link: whoever has it can use it once. The email says to ignore it if unexpected |
| Spamming a third party with approval emails | 3 per recipient per day, 10 per user per hour, 5 pending per user, 10 minute resend cooldown |
| HTML or header injection through names and assets | One-line, length-capped, escaped; asset values are validated hostnames/URLs |
| Malicious evidence upload | Content sniffing, 10 MB cap, no SVG/HTML, random storage key, attachment-only download with `nosniff` |
| Scope creep during a scan | Hosts re-validated against the asset rule at every stage; lookalikes and private addresses dropped |
| Authorization ends mid-scan | Checked at creation, worker start, every stage and every 15 s; fail closed; partial results kept |
| Smuggling a `roeId` into a job | Always stripped at creation; set only from the gate's own decision |
| Using someone else's engagement | Coverage is matched on the requester and workspace |
| Window abuse | Max 90 days; start at most 60 days ahead; a request cannot be edited after sending |

## Own-path details

The "Prove you control this website" step puts the **DNS TXT record first**, with
a copy button; the file and meta-tag proofs are under "Other methods". While the
page is open it checks by itself every 30 seconds for up to 30 minutes, then
leaves a "Check again" button. The scan starts as soon as the server confirms the
proof. "Send to your admin" copies a ready message (in the user's language) with
the exact record.

The server enforces the pace itself: one conditional update claims each check, so
a target is never checked more often than every 20 seconds whatever the client
does (HTTP 429, `OWNERSHIP_CHECK_TOO_SOON`). The three proofs are checked
independently, so a DNS failure never stops the web-based checks.

## Operating notes

- Email goes through the existing mail provider (`MAIL_SERVICE`). In development
  the messages are written to `.mail-outbox/` (a `.txt` and a `.html` per
  message). Links use `FRONTEND_URL`: `/roe/approve/<token>` and
  `/roe/revoke/<token>`.
- Migration `20261217000000_roe_authorizations` is additive: new enum values and
  three tables (`roe_authorizations`, `roe_assets`, `roe_email_events`). The
  `ALTER TYPE … ADD VALUE` statements use `IF NOT EXISTS`, so re-running is safe.
- Audit events: `ROE_REQUESTED`, `ROE_EMAIL_SENT`, `ROE_APPROVED`, `ROE_DECLINED`,
  `ROE_REVOKED`, `ROE_CANCELLED`, `ROE_SCAN_AUTHORIZED`, `ROE_SCAN_STOPPED`.
- Reports for engagement scans state the client, the approved window, the approval
  time and the approving mailbox, and say that the approval does not prove the
  approver's identity or authority. On a shared (public) report the mailbox is
  masked (`ci***@acme.example`).

## Legal text: what was checked, what is proposed (not applied)

Checked against the current Terms, Acceptable Use Policy and Privacy Policy
(`apps/web/features/legal/content`, `LEGAL_VERSION` 2026-10-13):

- **Attested scans (owner confirmation without proof)**: already covered. The Terms say
  the Service "does not verify your authorization on your behalf (except where a
  verification feature is explicitly enabled)", the user declares authorization for
  each target, and the declaration is audited (Terms section on audit records, Privacy
  Policy list of records). The AUP requires ownership or written authorization.
  Nothing to change.
- **Client engagements (ROE)**: the AUP and Terms cover the *requester's* duty to hold
  written authorization. What they do not mention is data about the **client**:
  Secora emails a third party, stores their mailbox address, the time, IP address and
  browser of their decision, and an optional evidence file.

No legal text was changed: editing it means bumping `LEGAL_VERSION`, which makes every
user re-accept, and the Uzbek and Russian versions are marked for legal review. For the
next legal revision, proposed wording (English; the other languages follow it):

- Privacy Policy, "What we collect": *"When you ask a client to approve a test, we process
  the client contact's name and email address that you give us, the approval request
  (assets, test window, signatory), the client's decision with its time, IP address and
  browser, and any evidence file you attach. We use them to send the request, to
  record the authorization and to investigate abuse, and keep them as long as audit
  records are kept."*
- AUP, section 1: *"A client's email approval confirms only that someone with access to
  that mailbox approved. You remain responsible for making sure that the person is
  entitled to authorize the test."*
