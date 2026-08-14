# Module 15 Security Review — Follow-up (tasks #356, #357, #366)

`0008-m15-security-hardening-review.md` (task #344) was a dedicated pass
over Billing, Marketplace Security, Public API v1/keys, Webhooks, and
Integrations, and found/fixed two HIGH SSRF issues. This is a narrower
follow-up scoped to what was added *after* that review closed: the
Stripe webhook receiver (task #366), release engineering (task #356),
and the feature flags system (task #357). Same static-review posture as
every prior review in this directory — no running instance, no load/pen
testing tools available in this sandbox.

## 1. `StripeWebhookController` — signature verification

Reviewed for the standard webhook-forgery class of bug: can a request
without knowledge of `STRIPE_WEBHOOK_SECRET` cause a state change?

- Signature check happens before the raw body is parsed as JSON and
  before any database access — an attacker with an invalid/missing
  signature is rejected (401) at essentially zero cost (one HMAC compute),
  never reaching `SubscriptionService`/`InvoiceService`.
- Comparison uses `timingSafeEqual`, with the same length-mismatch-safe
  pattern (`timingSafeEqual` against a same-length zero buffer before
  reporting failure) `BillingWebhookController`'s `secretsMatch()`
  established — response timing doesn't leak how many leading bytes of a
  forged signature matched.
- A `t=` timestamp more than 5 minutes from server time is rejected
  (replay-window bound), matching Stripe's own documented tolerance.
- No new dependency introduces a parsing/deserialization attack surface
  — `JSON.parse` on the raw body only, no `eval`/`Function` construction
  anywhere in the new code.
- If `STRIPE_WEBHOOK_SECRET` is unset, the endpoint fails closed
  (`503 STRIPE_WEBHOOK_NOT_CONFIGURED`) rather than silently accepting
  unsigned events.
- The global `ThrottlerModule` default (100 req/60s, `app.module.ts`)
  applies to this route like every other — no per-route throttle was
  added, but none is needed: rejected requests are already cheap, and
  Stripe's own retry behavior for a real deployment is low-volume.

**No finding.** One gap already disclosed in
`docs/architecture/stripe-webhook.md` and not re-litigated here: no
event-id idempotency ledger, so a redelivered event re-applies the same
write (harmless because the write is idempotent-by-value, not
idempotent-by-request, but worth a future pass if strict duplicate-
delivery auditing is ever needed).

## 2. `FeatureFlagsController` — authorization model

`POST /feature-flags` and `POST /feature-flags/overrides` require only
"authenticated," not a specific role — deliberately, and disclosed both
in the controller's own doc comment and in
`docs/architecture/feature-flags.md`, following the exact precedent
`ClusterOverviewService` (Module 14) and the Support ticket queue (task
#355) already established for "no deployment-wide platform-admin role
exists yet." This means **any authenticated user of any role can create
flags and set overrides for any scope, including other users' `USER`-scoped
overrides and other organizations' `ORGANIZATION`-scoped overrides** —
worth stating plainly rather than leaving implicit. Since feature flags
gate *feature visibility*, not data access or financial transactions, the
blast radius of abuse is "an authenticated user turns a feature on/off
for themselves or, if they guess/enumerate IDs, someone else" — annoying,
not a data breach. Flagged here as the actual concrete risk (not just
"no RBAC" in the abstract) so a future platform-admin-role pass knows
exactly what to gate first.

**Recommendation, not implemented this pass** (would require the
platform-admin role infrastructure itself, out of scope for a security
review): gate `create`/`setOverride` behind that role once it exists; in
the meantime, operators who care should restrict `/feature-flags` (except
`/feature-flags/evaluate`) at the reverse-proxy layer.

`GET /feature-flags/evaluate` was checked for cross-tenant leakage: it
only ever resolves flags for `req.user.id` plus whatever
`workspaceId`/`organizationId` the *caller* supplies as query params —
there's no server-side lookup of "the caller's" workspace, so a caller
can technically pass an arbitrary `organizationId` they don't belong to.
The consequence is limited to seeing that organization's
`ORGANIZATION`-scoped flag overrides (booleans only, no other data) —
still worth tightening in a future pass by validating membership before
including the organization-scoped override in the response, but not
elevated to a fix-now finding given the low sensitivity of the leaked
data (a true/false per flag key, nothing else).

## 3. Release engineering (`RELEASE_CHANNEL`) — no new surface

Purely a read of a `ConfigService` value set at deployment time, surfaced
on an already-`@Public()` endpoint (`GET /observability/health`). No
user input involved. **No finding.**

## 4. Support ticket email construction — reviewed, not a finding

`CreateSupportTicketHandler` builds email subject/body by string-
concatenating user-supplied `data.subject`/`data.category`/`data.message`.
Checked for header injection (CRLF in the `Subject:` header): delivery
goes through `nodemailer`'s `transporter.sendMail()` with `subject` as a
distinct object field, not raw header-string concatenation —
`nodemailer` encodes/validates header values internally and does not
pass through unescaped CRLF sequences. `data.email` (used as `to` on the
confirmation mail) is validated with `@IsEmail()`, which rejects the
malformed multi-address/CRLF strings a header-injection attempt would
need. **No finding**, but worth re-checking if `SmtpMailService` is ever
swapped for a provider that constructs raw header strings itself.

## Summary

No new HIGH/MEDIUM findings from this pass's own code. One concrete,
plainly-stated authorization gap on feature-flag management routes
(already disclosed, tracked as future work pending a platform-admin
role) and one minor cross-tenant information leak on `evaluate` (boolean
flag values only, not elevated to a fix-now finding). Everything else —
Stripe webhook signature verification, release-channel surfacing, support
email construction — reviewed clean.
