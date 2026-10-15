# Module 20 — Phases 15-17: API Stability, SDK/CLI, Mobile/Desktop Final Review

## Phase 15: API stability classification

No dedicated "stable vs. beta/experimental" endpoint-tagging scheme
exists, and none is needed to be added: `docs/architecture/api-gateway.md`'s
"Versioning policy" section documents a deliberate no-URI-versioning
decision (no `/v1/` prefix, no stability tags in Swagger) in favor of
strict additive-only evolution — new endpoints/fields are always safe to
add; breaking changes require a new path segment and a `docs/releases/`
entry. This is a considered, pre-existing policy, not a gap.

**Correction to this module's own prior framing**: earlier in this
module I described `POST /public-api/keys/:id/rotate` as "new public API
surface added this module." That was inaccurate — the route has existed
since Module 15 (task #336, commit `fc90106`); what Module 20 actually
added was the `API_KEY_ENDPOINTS.rotate` shared constant (a frontend
convenience) and, this phase, its first SDK/CLI wrappers. Corrected here
for the final report's accuracy.

## Phase 16: SDK/CLI parity — real gap found and fixed

An audit found that the public API keys resource (`GET/POST /public-api/keys`,
`DELETE /public-api/keys/:id`, `POST /public-api/keys/:id/rotate` — live
since Module 15) had **zero coverage** in any of the three SDKs
(`packages/sdk-typescript`, `sdks/python`, `sdks/go`) or the CLI
(`packages/cli`). This predates Module 20 (it's a Module 15-era gap that
was simply never closed), but it's real and worth closing before a v1.0
cut, and additive-only per the versioning policy above — safe, low-risk
work.

**Fixed** by mirroring each codebase's own existing per-resource pattern
exactly (no new abstractions introduced):

- `packages/sdk-typescript/src/resources/api-keys.resource.ts` (new) —
  `ApiKeysResource.{list,create,revoke,rotate}`, wired into `client.ts`
  and re-exported from `index.ts`.
- `sdks/python/pentesthub_ai/resources/api_keys.py` (new) —
  `ApiKeysResource` with the same four methods, snake_case params/
  camelCase JSON body matching every other Python resource; wired into
  `resources/__init__.py` and `client.py`; README's "Scope (v1)" resource
  list updated to 15 entries per the `0021-post-m18-sdk-reconciliation.md`
  convention.
- `sdks/go/api_keys.go` (new) — `ApiKeysResource` plus `ApiKey`/
  `CreateApiKeyRequest`/`CreateApiKeyResult`/`RotateApiKeyResult` structs
  mirroring the shared-package DTOs field-for-field; wired into
  `client.go`; README updated identically to the Python SDK's.
- `packages/cli/src/commands/api-keys.ts` (new) — `api-keys list/create/
  revoke/rotate` subcommands over the CLI's own `HttpClient`, wired into
  `bin/pentesthub.ts`'s dispatch switch and help text.

No SDK-side error handling addition was needed for `QUOTA_EXCEEDED`
(the code Phase 8's recon/vuln quota enforcement can now return): it was
already a documented closed error code in `packages/shared/src/errors.ts`
from the pre-existing AI budget enforcer, and every SDK's `HttpClient`
already retries generically on any 429 — no special-casing exists or is
needed anywhere.

**Separately noted, not fixed**: the audit also surfaced that
`QUOTA_EXCEEDED` is thrown as HTTP 403 by the older, Module-10-era
`apps/api/src/modules/enterprise/quota-enforcement.util.ts` (entity-count
limits — max workspaces/members/teams/etc.) but as HTTP 429 by the
newer, Module-15-era `QuotaService.enforce()` (periodic usage-metering
limits — the mechanism Phase 8's recon/vuln fix uses). These are two
different subsystems for two different kinds of limit (entity-count caps
vs. rate/usage caps) that happen to share the same error-code string.
429 is the more semantically correct HTTP status for a usage/rate
quota per the HTTP spec; 403 is defensible for "you've hit a hard
account-size limit." Reconciling the two is a real but low-priority,
pre-existing (not introduced by this module) inconsistency — changing
either now risks an unrelated-module behavior change this late in the
release cycle for a cosmetic-severity issue, so it's documented here as
a known limitation for a future module rather than fixed in this pass.

## Phase 17: Mobile/Desktop final review

No changes needed. `apps/desktop`'s recon/scanner tooling
(`src-tauri/src/recon/`, `.../scanner/`) runs security tools **locally**
via its own `ToolRegistry` and never calls the cloud recon/vuln
job-creation endpoints Phase 8 touched — confirmed by grep (zero
references to `RECON_JOB_ENDPOINTS`/vuln-job endpoints or any API-keys
endpoint in `apps/desktop` or `apps/mobile`). `docs/reviews/0016-m18-cli-desktop-mobile-sdk-reliability-audit.md`
already verified both apps' reliability layers with no open action
items; this narrow follow-up confirms none of this module's four
concrete changes (IDOR fix, webhook ordering, quota enforcement, API
keys SDK/CLI parity) touch either app's code paths.

## Verification

- TypeScript SDK/CLI: `tsc --noEmit --noResolve --experimentalDecorators`
  structural check on all new/edited files — clean beyond the standard
  disclosed `--noResolve` noise (module-not-found, and one
  `instanceof`-narrowing-lost-under-`--noResolve` artifact in
  `bin/pentesthub.ts`'s pre-existing top-level error handler, confirmed
  unrelated to the new commands by inspection).
- Python SDK: `python3 -m compileall` clean; live-instantiated
  `SecoraClient` and confirmed `client.api_keys` exposes all four
  methods; existing `tests/test_client.py` suite still passes (5/5).
- Go SDK: `go`/`gofmt` unavailable in this sandbox (same disclosed,
  longstanding toolchain limitation as every prior module) —
  **NOT compiler-verified**. Manually cross-checked `api_keys.go`'s
  `HttpClient.Get/Post/Delete` call signatures against
  `http_client.go`'s actual method signatures (`Get(ctx, path, query
  url.Values, out)`, `Post(ctx, path, body, out)`, `Delete(ctx, path,
  out)`) and confirmed exact match, and confirmed `Query()` already
  skips empty-string map values (so passing an empty `workspaceID`
  through `List()` correctly omits the query param rather than sending
  `?workspaceId=`) — the same pattern `plugins.go`'s `ListInstallations`
  already uses for an identical optional-workspace-filter case.
