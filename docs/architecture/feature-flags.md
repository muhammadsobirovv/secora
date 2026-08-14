# Feature Flags — Architecture

Module 15, task #357. Schema (`FeatureFlag`/`FeatureFlagOverride`,
`FeatureFlagScopeType`) and shared DTOs (`packages/shared/src/feature-flags.ts`)
were added in task #325; this task adds the actual service, repository,
controller, and a thin frontend client/hook that consume them.

## Evaluation order

`FeatureFlagsService.evaluateAll()` (`apps/api/src/modules/feature-flags/feature-flags.service.ts`),
most specific wins:

1. `FeatureFlagOverride` at `USER` scope
2. `FeatureFlagOverride` at `WORKSPACE` scope (only checked if the caller
   supplied a `workspaceId`)
3. `FeatureFlagOverride` at `ORGANIZATION` scope (same caveat)
4. `editionRules` — every rule present is AND-ed together
   (`minEdition`, `selfHostedOnly`, `planTiers`, `betaOnly`, `developerOnly`)
5. `defaultEnabled`

`workspaceId`/`organizationId` are optional because `RequestUser` (the
JWT payload) doesn't carry either — the same "not reliably available
without new guard infrastructure" gap already disclosed for
`SupportTicket.workspaceId` (task #355). A caller that wants
workspace/organization overrides evaluated passes them explicitly as
query params on `GET /feature-flags/evaluate`.

## `editionRules` semantics

- `minEdition: "enterprise"` — requires `EditionService.isEnterpriseFor()`
  to resolve true for the evaluation's `organizationId` (reuses Module
  14's edition/license logic directly; no new gating mechanism).
- `selfHostedOnly` — `true` requires zero `License` rows exist at all
  (the same "no License row = trusted self-hosted install" signal
  `EditionService` itself uses); `false` requires at least one.
- `planTiers` — requires the evaluation's `organizationId` to have an
  active `Subscription` whose `Plan.tier` is in the list.
- `betaOnly` / `developerOnly` — **no user-cohort concept exists yet** on
  the `User` model, so both are interpreted conservatively rather than
  guessed at: a flag marked `betaOnly` can only ever be turned on by an
  explicit override (never by `defaultEnabled`); `developerOnly` behaves
  the same except it also stays enabled-by-default outside
  `NODE_ENV=production`. A future pass that adds a real cohort field
  should replace this interpretation rather than build on top of it.

## No platform-admin gate on management routes

`POST /feature-flags` (create) and `POST /feature-flags/overrides` (set
an override) require only authentication, not a specific role — this
codebase has no deployment-wide platform-admin role (the same gap
`ClusterOverviewService`, Module 14, and the Support ticket queue, task
#355, already disclose and route around). A production deployment should
restrict these two routes at the network layer until such a role exists.
`GET /feature-flags/evaluate` is intentionally open to any authenticated
user — it only ever returns *their own* resolved values, never another
user's or another organization's.

## Frontend

`apps/web/lib/api/feature-flags.ts` + `apps/web/features/feature-flags/hooks/use-feature-flags.ts` —
`useFeatureFlags()`/`useFeatureFlag(key)`, cached per
`(workspaceId, organizationId)` pair via React Query. No admin UI for
creating flags or setting overrides yet — the two management endpoints
above are usable via `curl`/Swagger today; a UI is future work, matching
this module's "reference implementation, gaps disclosed" scope pattern.

## Known gaps

- **No admin UI** for flag management (see above).
- **No guard/decorator** (e.g. `@RequiresFeatureFlag('key')`) wiring flag
  checks into route protection yet — `FeatureFlagsService.isEnabled()`
  exists and is safe to call from any other service/controller that
  wants to gate behind a flag, but nothing in this codebase does so yet.
- **`npx prisma generate` has not run in this sandbox** — same standing
  gap as every other Module 15 schema change; the repository interface
  is defined locally rather than imported from generated Prisma types
  (see the interface file's own doc comment).
- **No jest run to verify the new service's evaluation logic** — same
  standing sandbox limitation as the rest of this session. Verified by
  manual code review only.
