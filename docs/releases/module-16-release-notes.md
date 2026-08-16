# Module 16 Release Notes — Global Security Intelligence, Bug Bounty Platform & Collaboration

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
extension manifests.

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
- **Known gap, disclosed rather than fixed silently**:
  `ExtensionPermissionEnforcer.assertAuthorized()` has **no invocation-time
  consumer yet** — the registry stores and validates extension manifests
  (including declared permissions) but nothing in this pass actually invokes
  a registered extension, so the enforcer is exercised only by its own unit
  test. This is a real gap, not a false claim of enforcement: no code path
  in this module currently *executes* an extension, so there is no live
  authorization bypass today, but the enforcer must be wired into whatever
  invocation path is built next before extensions can run untrusted code
  under Module 16's permission model.
- No plaintext secrets found in new code paths; `ShareLink` tokens follow the
  established sha256-of-random-token hashing convention, not reversible
  encryption or plaintext storage.

## Known gaps

- **`prisma generate` / a real migration run** — not executed in this sandbox
  (`prisma` CLI physically absent, same disclosed category as every prior
  module). The consolidated migration SQL
  (`apps/api/prisma/migrations/20261101000000_global_security_intelligence_bugbounty_collaboration/migration.sql`)
  must be verified with `prisma migrate diff` against a real database before
  use.
- **`apps/api tsc --noEmit`, `jest`, full `apps/api` boot** — not executed
  this module; the sandbox limitations disclosed in every prior module's
  release notes (missing `jest`, prior missing root dependencies for
  `@nestjs/*`/`@prisma/client`) apply unchanged. `packages/shared` and
  `packages/sdk-typescript` **were** verified clean via `npx tsc --noEmit`.
  Python SDK files verified via `python3 -m py_compile` (clean).
- **Go SDK unverifiable** — the Go toolchain is entirely absent from this
  sandbox (`which go` fails); new Go SDK files are pattern-consistent with
  the existing Go SDK but not compiled or tested.
- **`packages/cli` has no installed `node_modules` in this sandbox** — a
  pre-existing gap discovered (not caused) this module; the new CLI command
  files could not be typechecked. Disclosed rather than claimed as verified.
- **Performance audit, full cross-surface test pass, and a dedicated
  database/migration review were deprioritized for this pass** — the user
  explicitly chose the order "security audit → documentation → final
  commit + report" over the original full 18-step sequence; these three
  items were not executed and are not claimed as done.
- **Mobile, Desktop Agent, Browser Extension** — see "Explicitly out of
  scope" above.
