# Module 16 Release Notes — Global Security Intelligence, Bug Bounty Platform & Collaboration

## Hardening pass (post-initial-close, task #454-#460)

Per explicit user direction, a second pass closed the one real gap the
initial security audit disclosed rather than leaving it open:
`ExtensionPermissionEnforcer` now has a real invocation-time consumer.
Summary (full detail in the "Extension API Registry" and "Security audit
summary" sections below, updated in place):

- `POST /extensions/:id/invoke` — a permission-checked, SSRF-guarded,
  timeout-bounded HTTP relay to an extension's declared `entrypoint`,
  reusing `assertSafeWebhookUrl` and the `fetch` + `AbortSignal.timeout`
  pattern from `WebhookDeliveryQueueService` rather than a new egress path.
- 8 new unit tests covering disabled/undeclared-permission/cross-workspace/
  unsafe-URL/oversized-input rejection and success/failure result shapes.
- Schema: `AuditEventType.EXTENSION_INVOKED` added (schema + migration.sql,
  both edited consistently).
- Two unbounded `findMany` queries found during a performance pass
  (`ListWatchersHandler`, `ListReactionsHandler`, `ListExtensionsHandler`)
  were given explicit `take` caps to match the convention every other
  Module 16 list handler already followed.
- `packages/shared`'s `dist/` was stale (missing the `extension-api`/
  `knowledge-graph` modules from earlier in this session) — rebuilt via
  `npx tsc`, which is what let `packages/sdk-typescript` typecheck clean
  for the first time this session (previously blocked by that staleness,
  not by anything wrong in the SDK source itself).
- Found, but did **not** fix (pre-existing, predates Module 16, out of this
  pass's scope): `packages/sdk-typescript/src/resources/plugins.resource.ts`
  has had the same "named DTO passed where an index-signature `Record` is
  expected" typecheck error since the Module 10 commit (`357d97f`) that
  introduced it. `extensions.resource.ts`'s own copy of the same pattern
  (introduced this session) was fixed with an explicit, documented cast.
- `prisma`/`jest` CLIs re-checked in this sandbox — same result as every
  prior check this session: both exist only as broken `.bin` stub scripts
  (`Cannot find module '.../jest/bin/jest.js'` /
  `'.../prisma/build/index.js'`), the actual packages were never installed.
  Not re-litigated further; see "Known gaps" below, unchanged from before
  this pass.
- `apps/api/prisma/schema.prisma` re-verified brace-balanced (6261 lines,
  final depth 0) and `AuditEventType` has no duplicate values; the
  consolidated `migration.sql` re-verified paren-balanced with its
  `CREATE TABLE`/`CREATE UNIQUE INDEX`/`ALTER TYPE` statements consistent
  with the schema — the closest verification possible without a working
  `prisma` CLI in this sandbox.

## Features added

**Scope Engine & pre-execution gate** — `ScopeEngine` validates every
recon/scan/tool invocation against a target's declared in-scope/out-of-scope
rules before execution is allowed to start, wired in front of `ToolRunner`/
`JobQueue` as a hard gate rather than an advisory check.

**Research Session, recon/technology/asset-graph intelligence** — session
tracking for research work, expanded recon-tool normalization, a
Target–Technology–Finding asset graph, technology-fingerprint normalization,
an Attack Surface dashboard, and change detection between successive scans
of the same target.

**Finding Intelligence & Risk Engine** — deterministic finding fingerprints
(stable across re-scans), a correlation engine that links related findings
across tools/scans, and a `RiskEngine` that scores findings using both
intrinsic severity and asset/business-context signals.

**CVE intelligence & vulnerability matching** — a CVE enrichment service and
a matching engine that ties detected technology versions to known CVEs.

**AI Investigation Mode & approval gates** — controlled-autonomy AI
investigation flows gated by a generic `SecurityApprovalService`/
`ApprovalGate` mechanism (reused, not reimplemented, by every subsequent
Module 16 feature that needed human-in-the-loop confirmation), plus a
`GlobalSecurityPolicyService` enforcing platform-wide security policy
independent of any single workspace's settings.

**Bug Bounty submissions, Safe Terminal, Playbooks** — reward-tracked bug
bounty submissions, a sandboxed Safe Terminal for controlled command
execution with a dedicated security test suite, and a playbook data model +
visual builder for repeatable research workflows.

**Collaboration extensions** — `Watcher`/`Reaction` models and CQRS layers
over Comments/Assignments/Tasks; comments previously published **zero**
domain events, so this pass also added `CommentCreatedEvent`/
`MentionCreatedEvent` (`apps/api/src/modules/collaboration/events/
comment-events.ts`), wired `CreateCommentHandler` to publish them, and
subscribed `ActivityRecordingHandler` to `CommentCreatedEvent` — comments
now correctly appear on the Activity Timeline, closing a pre-existing gap
rather than working around it.

**Real-time gateway** — `RealtimeModule` (`GET /realtime/stream`, SSE) plus
`POST /realtime/typing` and `POST /realtime/presence/heartbeat`. **Deviation
from the original "WebSocket gateway" wording, disclosed deliberately**: this
codebase has no `@nestjs/websockets`/`socket.io` dependency anywhere in the
monorepo (verified by grep) — SSE is the platform's one and only real-time
transport (used since Module 5's AI chat streaming). Rather than introduce a
new transport library, the gateway follows the same pattern: `EventBus` →
`RealtimePublishHandler` (a curated 14-event `@EventsHandler(...)` subscriber,
covering finding/job/comment/notification categories per spec) →
`RealtimeHubService` (in-process RxJS `Subject`, keyed by `workspaceId`) → SSE
stream to connected clients. Typing/presence are client→server signals
delivered over plain authenticated REST rather than the SSE channel, since SSE
is server→client only. Every client-supplied `workspaceId` is validated
against a real `WorkspaceMember` row via the existing `resolveWorkspaceMembership`
helper before a stream is opened or a signal is accepted — no query or event
payload trusts the client's claim outright. Single-process-only (Phase-1
limitation), matching the same disclosed constraint already documented for
`AiChatStreamHubService` and the recon/vuln worker.

**Public Sharing** — `ShareLink` model (sha256-hashed tokens, following the
same secret-hashing convention as API keys), a `public-share.controller.ts`
serving one legitimately unauthenticated, rate-limited
(`@Throttle({ limit: 20, ttl: 60_000 })`) endpoint, with dedicated security
tests.

**Knowledge Graph query layer** — `GET /knowledge-graph/search`,
`/node/:type/:id`, `/relationships/:type/:id`, `/path`, resolving a caller's
implicit personal workspace via `ResearcherMemoryWorkspaceResolver` (the same
resolver AI Memory uses) and joining every node type back through its owning
`Target.workspaceId` so results never cross a tenant boundary. Depth-capped
(`maxDepth` ≤ 4) path-finding to bound query cost.

**AI Memory** — long-term researcher memory over `ResearcherMemoryEntry`,
reusing the Module 11 AI-memory conventions rather than a new store.

**Extension API Registry** — `ExtensionRegistration` model + `ExtensionType`
enum, full CRUD (`register`/`list`/`get`/`enable`/`disable`/`unregister`)
under `/extensions`, an `ExtensionPermissionEnforcer.assertAuthorized()`
utility for permission-scoped checks, and DTOs with hard caps
(`@ArrayMaxSize(50)`, `@MaxLength`) on every list/string field accepted from
extension manifests. **Hardening pass**: `POST /extensions/:id/invoke` is
now that enforcer's real caller — authorize (enabled + permission declared)
→ SSRF-guard the entrypoint (`assertSafeWebhookUrl`, re-checked every call,
same DNS-rebinding posture as webhook delivery) → a single, timeout-bounded
(10s) HTTP POST relaying `{ extensionId, type, capabilities, permission,
input }` → an `EXTENSION_INVOKED` audit event either way. This is a uniform,
type-agnostic relay (authorize + relay, not execute) — it does not itself
run recon/scanner/agent/workflow-specific logic per `ExtensionType`; a
deeper per-type integration (e.g. feeding a `RECON_PROVIDER` straight into
`ToolRunner`) remains future work, not implied by this endpoint's existence.

**SDK & CLI** — Knowledge Graph and Extensions resources added to the
TypeScript SDK (`packages/sdk-typescript`), Python SDK (`sdks/python`), Go
SDK (`sdks/go`), and the CLI (`packages/cli` — `pentesthub knowledge-graph
...`, `pentesthub extensions ...`), extending the same deliberately-scoped
"v1 surface" convention already documented for Auth/Organizations/
Distributed Jobs/Plugins/Integrations. Collaboration extensions, Sharing, AI
Memory, and the Real-time SSE gateway remain unwrapped in the SDKs — not part
of this pass's scope.

## Explicitly out of scope (user decision)

Mobile (`apps/mobile`), Desktop Agent (`apps/desktop`), and Browser Extension
UI integration for Module 16 surfaces were **explicitly deferred by user
decision** during this module's build (chosen over "API-client layers only"
and "deep-dive one platform") — no work was attempted on these three
surfaces for Module 16 and none should be inferred as done.

## Security audit summary (this pass)

- All new controllers sit behind the global `JwtAuthGuard` (`APP_GUARD` in
  `app.module.ts`); none use `@Public()` except the one intentionally public,
  rate-limited `public-share.controller.ts` endpoint.
- `RolesGuard` is a no-op unless a route opts in via `@Roles(...)` — none of
  the new Module 16 routes use role gating, which is correct/expected (they
  are workspace-membership-scoped, not role-scoped).
- Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true,
  transform: true })` applies to every new DTO; every new DTO carries
  `class-validator` decorators (`@IsString`, `@IsIn`, `@ArrayMaxSize`,
  `@MaxLength`, `@Min`/`@Max`, etc.) — none accept unbounded strings/arrays.
- Grep sweep for client-supplied `workspaceId` flowing directly into a Prisma
  `where` clause (`workspaceId: query\.|dto\.|body\.`) across all of
  `apps/api/src/modules` found two hits, both in this module's own
  `realtime.controller.ts` — both confirmed safe: used only to key an
  outgoing event payload after `resolveWorkspaceMembership` has already
  validated real membership, never in a database query.
- Every "not found" response across new modules stays enumeration-safe
  (identical wording whether an id doesn't exist or belongs to another
  tenant) — the existing platform convention.
- **Resolved this pass (previously the one disclosed gap)**:
  `ExtensionPermissionEnforcer.assertAuthorized()` now has a real
  invocation-time consumer — `InvokeExtensionHandler` /
  `POST /extensions/:id/invoke`. Verified: disabled extensions and
  undeclared permissions are rejected *before* `assertSafeWebhookUrl` or
  `fetch` are ever reached (asserted directly in the unit tests, not just
  by reading the code); a cross-workspace extension id returns the same
  enumeration-safe 404 as every other extension-registry endpoint; an
  unsafe entrypoint URL is rejected before any network call; oversized
  invocation input (>100KB JSON) is rejected before the URL check even
  runs. Remaining, disclosed scope limit: this is one generic HTTP-relay
  invocation path shared by all seven `ExtensionType`s, not seven
  type-specific integrations into `ToolRunner`/the Agent framework/the
  Workflow engine — see the Extension API Registry feature entry above.
- No plaintext secrets found in new code paths; `ShareLink` tokens follow the
  established sha256-of-random-token hashing convention, not reversible
  encryption or plaintext storage.

## Known gaps

- **`prisma generate` / a real migration run** — still not executed in this
  sandbox (`prisma` package is missing — only a broken `.bin` stub script
  resolves — re-confirmed during the hardening pass, unchanged from every
  prior module). Best-effort substitute performed instead: the schema was
  confirmed brace-balanced with no duplicate enum values, and
  `migration.sql` was confirmed paren-balanced with its new
  `CREATE TABLE`/index/`ALTER TYPE` statements consistent with the schema.
  The migration must still be verified with `prisma migrate diff` against a
  real database before use.
- **`jest`, full `apps/api` boot** — `jest` re-confirmed unavailable this
  pass (same "stub script, package never installed" result as `prisma`
  above); the 8 new invoke-path tests exist and are internally consistent
  (mocked dependencies, explicit assertions on call order and rejected
  network calls) but were not executed. `packages/shared` and
  `packages/sdk-typescript` **were** verified clean via `npx tsc --noEmit`
  this pass (after rebuilding `packages/shared`'s stale `dist/`). Python SDK
  files verified via `python3 -m py_compile` (clean).
- **Go SDK unverifiable** — the Go toolchain is still entirely absent from
  this sandbox; the new `Invoke` method added to `sdks/go/extensions.go`
  this pass is pattern-consistent with the rest of that file but not
  compiled or tested.
- **`packages/cli` still has no installed `node_modules` in this sandbox**
  — re-confirmed this pass; the new `extensions invoke` CLI command could
  not be typechecked, same as the rest of the CLI's Module 16 commands.
- **Pre-existing, unrelated bug found (not fixed, out of scope)**:
  `packages/sdk-typescript/src/resources/plugins.resource.ts` has a
  typecheck error (`ListPluginsQueryDto` passed where an index-signature
  `Record` is expected) dating to the Module 10 commit that introduced it —
  predates and is unrelated to Module 16. `extensions.resource.ts`'s own
  instance of the identical pattern (introduced this session) was fixed
  with an explicit cast; `plugins.resource.ts` was left as found.
- **Mobile, Desktop Agent, Browser Extension** — see "Explicitly out of
  scope" above; unchanged by the hardening pass.
