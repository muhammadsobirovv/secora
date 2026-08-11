# Web Application Firewall (WAF) Compatibility

This platform doesn't ship a bundled WAF (ModSecurity, AWS WAF, Cloudflare,
etc.) — that's an infrastructure-layer choice left to the deployment
operator, same as the TLS-terminating proxy it typically sits alongside (see
[`tls-mtls-certificates.md`](./tls-mtls-certificates.md)). This document is
the compatibility checklist for whichever WAF you put in front: which of this
platform's own request/response shapes a default-tuned WAF is most likely to
flag as a false positive, and which headers the app depends on that a WAF
must be configured to pass through untouched.

## Traffic shapes a default WAF ruleset may flag

- **SSE streams** (AI chat completions in Module 5/11, live recon/vuln job
  logs in Modules 3/4) are long-lived (up to `proxy_read_timeout 3600s` in
  both `deploy/nginx/lb.conf` and `deploy/nginx/tls-termination.conf.example`)
  `text/event-stream` responses with no `Content-Length`. Some WAF rule sets
  (notably ModSecurity's OWASP Core Rule Set with response-body buffering
  enabled) will either time out or attempt to buffer the entire response
  before releasing it, which breaks streaming outright or defeats its
  purpose. Disable response-body inspection/buffering for the SSE routes
  specifically (chat completion endpoints, job log-streaming endpoints) —
  request-body inspection on the same routes is unaffected and should stay
  on.
- **Bug bounty finding/report content and AI-generated report text**
  (Modules 6, 11) routinely contains security payload examples — SQL
  injection strings, XSS snippets, command injection sequences — as
  legitimate data, not attacks, since this is a pentesting platform. Generic
  WAF rules that block requests containing `<script>`, `UNION SELECT`, `; rm
  -rf`, etc. in the request body will false-positive heavily on Create/Update
  Finding, report draft, and payload-library endpoints. Either exclude those
  specific routes from body-content WAF rules, or run the WAF in
  detection/log-only mode for this platform rather than blocking mode — a
  hard block on those routes makes the product unusable for its actual
  purpose.
- **Bulk import endpoints** (bug bounty program importer, backup restore
  flows, plugin/script installation) accept larger-than-typical request
  bodies. Confirm the WAF's own request-size limit is raised at least to
  match whatever this platform's own limits are configured to (Express's
  default body-parser limit, or a `client_max_body_size` set at the nginx
  layer) — a WAF with a lower ceiling than the app rejects legitimate large
  imports before they even reach the app to be validated properly.
- **Webhook delivery payloads** (outbound, from this platform to a
  third-party endpoint — `webhook-delivery-queue.service.ts`) aren't
  WAF-relevant on the way out, but if you also run a WAF in front of a
  webhook *receiver* you control (e.g. an internal system consuming this
  platform's webhooks), the same body-content caveat as findings/reports
  applies if that receiver ever surfaces raw finding data.

## Headers the app depends on — must pass through unmodified

- `X-Forwarded-For` / `X-Forwarded-Proto`: `TRUST_PROXY_HOPS` (see
  `apps/api/src/config/env.validation.ts` and `bootstrap.ts`) tells Express
  exactly how many proxy hops to trust when resolving the real client IP from
  these headers. **A WAF is itself a hop.** If you add a WAF in front of the
  existing TLS-terminating proxy, `TRUST_PROXY_HOPS` must increase by one (or
  by however many hops the WAF adds) to match, or `req.ip` — which
  `IpAllowlistGuard`, audit logging, and rate limiting all key off — will
  resolve to the WAF's own IP instead of the real client's. Verify with
  `/observability/health`'s logs or a temporary debug log line after any WAF
  is added or removed, not just after the initial rollout.
- `Authorization: Bearer <jwt>`, `X-API-Key`, and `X-Client-Cert-Verify` (only
  when `MTLS_REQUIRED=true`, see `tls-mtls-certificates.md`): none of these
  should be stripped, rewritten, or added to a WAF's own default
  sensitive-header redaction/logging exclusion list in a way that also drops
  them from the forwarded request — a WAF that scrubs `Authorization` headers
  from its own logs (a reasonable, even recommended, default) must still
  forward the original header value to the upstream app; only the WAF's *own*
  logs should redact it.
- `X-Request-Id`: set by `requestContextStorage`/`requestIdMiddleware` for
  correlating logs across the request's lifetime — not security-sensitive,
  but a WAF that unconditionally overwrites incoming `X-Request-Id` values
  breaks the ability to correlate a client-side error report back to server
  logs for that same request. Prefer a WAF configuration that only *sets*
  this header when absent, not one that always overwrites it.

## Rate limiting: avoid double-counting

`ThrottlerGuard` (registered first in `app.module.ts`'s guard chain, before
`IpAllowlistGuard` and `MtlsGuard`) already enforces request-rate limits at
the application layer. A WAF's own rate limiting is a legitimate second layer
of defense (it can shed load before it ever reaches the app, which
`ThrottlerGuard` can't), but the two limits are independent and not
coordinated — a client that trips the WAF's limit gets a WAF-generated error
page (not this platform's structured JSON error shape), and a client that
trips `ThrottlerGuard`'s limit gets the platform's own `429` response.
Configure the WAF's rate limit *above* `ThrottlerGuard`'s configured
threshold if the goal is "WAF catches abusive traffic before it costs the app
anything," or independently tune it lower if the goal is a coarser
infrastructure-level ceiling — pick one intent rather than leaving both at
default values that might silently conflict (e.g. the WAF blocking a burst
that `ThrottlerGuard` would have allowed, on a route where bursts are
expected — bulk import, webhook delivery redelivery).

## CORS preflight

`app.enableCors({ origin: FRONTEND_URL, credentials: true, ... })` in
`bootstrap.ts` handles CORS at the application layer already. A WAF
positioned in front should let `OPTIONS` preflight requests through
untouched (no auth-header requirement, no body-content inspection — a
preflight request has no body) so the browser's preflight round-trip
succeeds before the actual request is even sent; blocking or challenging
(e.g. a JS-challenge/CAPTCHA-style WAF feature) an `OPTIONS` request breaks
every cross-origin call the frontend makes.

## Recommended rollout approach

Given the payload false-positive risk above (security-payload strings being
core, legitimate product content), run any new WAF in **detection/log-only
mode** against this platform first, review what it would have blocked over a
representative period covering normal finding/report creation and bulk
import usage, then tune exclusions before switching to blocking mode. This
mirrors the same "disclose what's a starting point, verify before trusting
it" posture used throughout this module's other security controls.
