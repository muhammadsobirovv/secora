# Module 15 Security Hardening Review (task #344)

Reviewer stance: dedicated security pass over the feature surfaces Module 15
itself introduced — Billing, Marketplace + Marketplace Security, Public API
v1 + API keys, Webhooks, and Integrations. This is narrower than the
end-of-program gate reviews in this directory (`0003-final-security-review.md`
covered Modules 1-10 platform-wide); it exists specifically to catch
vulnerabilities Module 15's own new code could have introduced, per the
standing project instruction that Module 15 close with a dedicated security
review rather than assuming prior modules' review already covers it.

**Headline**: two HIGH-severity SSRF findings, both in code this module
added, both fixed during this pass. One HIGH-severity billing-completeness
gap found and deliberately deferred to its own tracked task (#366) rather
than rushed. One MEDIUM-severity pre-existing (Module 9) authorization gap
noted but not touched, per the standing "don't rewrite previous modules"
instruction. Everything else reviewed came back clean.

---

## Findings

### 1. [HIGH — FIXED] SSRF via user-supplied webhook URLs

`CreateWebhookTokenDto.url` was validated only with `@IsUrl({ require_tld:
false })`, which accepts `http://127.0.0.1/...`, `http://169.254.169.254/...`
(cloud metadata endpoints), and RFC1918 addresses. Two outbound `fetch()`
call sites used a stored URL with no further validation:
`TestWebhookTokenHandler` (`webhook-tokens.commands.ts`) and
`WebhookDeliveryQueueService.attemptDelivery`
(`webhooks/webhook-delivery-queue.service.ts`). A workspace MANAGER (the
minimum role required to create a webhook) could point a webhook at an
internal service or cloud metadata endpoint and use the API server as an
SSRF pivot.

**Fix**: new `common/utils/ssrf-guard.util.ts` — `assertSafeWebhookUrl()`
resolves the hostname via DNS and rejects if *any* resolved address is
loopback/private/link-local/multicast/reserved (IPv4 and IPv6, including
IPv4-mapped IPv6). Applied at three points: creation time
(`CreateWebhookTokenHandler`, immediate rejection for good UX) and at both
outbound-fetch call sites (`TestWebhookTokenHandler`,
`WebhookDeliveryQueueService.attemptDelivery`). Checking again at delivery
time — not just once at creation — matters: a hostname that resolves
publicly when a webhook is created can be re-pointed at an internal address
later (DNS rebinding), and the delivery poller runs unattended on a fixed
schedule.

### 2. [HIGH — FIXED] SSRF via Discord/MS Teams integration webhook URLs

`DiscordAdapter` and `MsTeamsAdapter`
(`modules/integrations/adapters/messaging-adapters.ts`) treat their
`credentials` field as an arbitrary webhook URL an org ADMIN supplies and
`fetch()` it directly in both `testConnection()` and `execute()`, with no
validation that it actually points at Discord/Microsoft's own webhook
hosts. Same SSRF class as finding #1, gated behind org ADMIN rather than
workspace MANAGER.

**Fix**: `assertKnownWebhookHost()` (same file) — a strict hostname
allowlist (`discord.com`/`discordapp.com` for Discord;
`office.com`/`logic.azure.com` for MS Teams, covering both the legacy
Office 365 Connector and the modern Power Automate webhook hosts), applied
before every outbound call in both adapters. Deliberately an allowlist
rather than the general private-IP-resolution guard used for finding #1:
Slack and Telegram already only ever call their own hardcoded API hosts
(no user-supplied URL involved), and Discord/Teams only ever need a URL on
one known vendor host, so a strict allowlist is simpler and more precise
than resolving-and-checking an arbitrary hostname.

### 3. [HIGH — DEFERRED, tracked as task #366] Stripe payment completion webhook missing

`SubscriptionService.upgrade()` (`modules/billing/subscription.service.ts`)
correctly creates a Stripe Checkout session without prematurely trusting
any client-reported success — **no authorization-bypass risk was found
here**, unlike findings #1/#2. The gap is completeness, not a bypass:
nothing in the codebase verifies a Stripe webhook signature and completes
the loop by transitioning the new `Subscription` row to `ACTIVE` after
Stripe confirms payment. `STRIPE_WEBHOOK_SECRET` is declared in
`env.validation.ts` but never read anywhere (confirmed via `grep`). The
only existing webhook receiver
(`modules/enterprise/controllers/billing-webhook.controller.ts`, Module 14)
authenticates via a static shared secret against the legacy
`Organization.subscriptionStatus` field and never touches the `Subscription`
table Module 15 introduced. Practical impact: once an operator configures a
live `STRIPE_SECRET_KEY`, a customer who completes Stripe Checkout would
never actually have their `Subscription` activated. Rated HIGH because it's
billing-correctness-critical for any deployment that turns on real Stripe
billing, but explicitly **not** an exploitable vulnerability in the
security sense (nothing an attacker can trigger). Deliberately not
implemented in this pass — building a correct Stripe webhook handler
(signature verification + multiple event types + idempotency) is a
substantial feature, not a guard-clause fix, and cramming it into a review
pass risks doing it carelessly. Tracked as task #366 with the exact file
paths and event types needed.

### 4. [MEDIUM — NOTED, not fixed] API key `scopes` declared but not enforced outside MCP

`ApiKeyAuthGuard` (`modules/public-api/guards/api-key-auth.guard.ts`)
populates `request.apiKeyScopes` from `ApiKey.scopes`, but only
`McpRpcController` (Module 13) actually reads and enforces it. Machine-facing
routes added by earlier modules — `WorkerJobsController`,
`WorkerNodesController` (Module 10, distributed jobs) — apply
`@UseGuards(ApiKeyAuthGuard)` but never check `apiKeyScopes`: any valid API
key, regardless of what scopes its owner declared for it at creation time,
can call them. This predates Module 15 (the guard itself is Module 9); task
#336 ("API key management improvements") added the `scopes` field's
create-time plumbing but never closed the enforcement gap on non-MCP
routes.

**Why not fixed in this pass**: there is no existing scope-string
convention or catalog anywhere in the codebase (`grep` for a canonical
`API_KEY_SCOPES` list or similar returns nothing) — `scopes` has been
free-form, unvalidated text since Module 9. Building enforcement now would
mean inventing a scope taxonomy from scratch under review-pass time
pressure, which risks a worse outcome than leaving it visibly documented:
a mis-designed taxonomy is harder to walk back once API keys exist in
production than an honestly-disclosed gap. Recommendation for whoever picks
this up: define a small closed enum of scope strings (e.g.
`worker:jobs:claim`, `worker:jobs:report`, `mcp:*`) in
`packages/shared/src/api-versioning.ts` or a new file, add a
`RequireApiKeyScope(...)` decorator + a check inside `ApiKeyAuthGuard` (or
a second guard chained after it), and apply it to
`WorkerJobsController`/`WorkerNodesController` alongside whatever MCP
already does internally.

### 5. [LOW / INFO — accepted, not a bug] Marketplace plugin signing is advisory-only

`PublishPluginHandler` (`modules/marketplace/commands/plugins.commands.ts`)
sets `verified = attempted && valid` but does not block publishing on a
missing/invalid signature; `MarketplaceScannerService` results are
advisory. This is documented as intentional v1 scope in task #333's own
completion notes, not a gap introduced or missed by this review — restated
here only so a reader of this document has the full picture in one place.

---

## Areas reviewed and found adequately protected

- **Billing IDOR** — `BillingController`, `UsageController`, `InvoiceService`
  all scope every query by `organizationId` via
  `resolveOrganizationMembership`/`findFirst({ organizationId })`. No
  cross-org access found.
- **API keys at rest** — stored as a SHA-256 hash only
  (`api-keys.commands.ts`), never plaintext. Per-key IP allowlist and
  rate limiting are correctly enforced in `ApiKeyAuthGuard`.
- **Plugin permission enforcement (task #334)** —
  `PluginPermissionEnforcerService.resolveEffective()` correctly intersects
  granted ∩ declared permissions; `InstallPluginHandler` requires exact-match
  user consent; the plugin sandbox only grants capabilities present in the
  enforced set. No bypass found.
- **Integration/webhook secrets at rest** — both reuse
  `credential-encryption.util.ts` (AES-256-GCM, same construction as
  `buffer-encryption.util.ts` for BYOK AI credentials); the webhook HMAC
  signing secret is `randomBytes(32)`, stored encrypted, never logged.
- **Rate limiting** — the global `ThrottlerGuard` (100/min/IP) covers every
  controller by default; plugin install/publish routes carry an additional,
  tighter `@Throttle` limit.
- **Integration OAuth state** — HMAC/encrypted state carries
  provider+org+user and is verified on callback. No CSRF gap found.

---

## Summary for the record

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | SSRF via `WebhookToken.url` | High | Fixed this pass |
| 2 | SSRF via Discord/MS Teams integration URLs | High | Fixed this pass |
| 3 | Stripe payment completion webhook missing | High (correctness, not auth-bypass) | Deferred — task #366 |
| 4 | API key scopes unenforced outside MCP | Medium | Noted — pre-existing, no task filed yet (recommendation above) |
| 5 | Marketplace signing advisory-only | Low/Info | Accepted, documented elsewhere (task #333) |

This review does not claim to be exhaustive of every code path Module 15
touched — see task #364's final verification loop for the closing gate this
feeds into, and task #365 for the separate (non-security) gap around the
generated Prisma client being stale relative to schema.prisma across this
whole module.
