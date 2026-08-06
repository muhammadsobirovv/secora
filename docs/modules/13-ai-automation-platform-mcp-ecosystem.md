# Module 13 — AI Automation Platform + MCP Ecosystem + Security Agent SDK

Decision record: `docs/adr/0013-ai-automation-platform-mcp-ecosystem.md`.
Release notes: `docs/releases/module-13-release-notes.md`. Protocol guide:
`docs/mcp/mcp-guide.md`.

## 1. Prisma schema

New tables in `apps/api/prisma/schema.prisma`
(migration `20260801000000_ai_automation_platform_mcp_ecosystem`):
`McpSession` + `McpToolInvocation` (MCP transport/audit), `AgentSdkDefinition`
+ `AgentSdkRun` (Agent SDK), `ScriptDefinition` + `ScriptExecution` (Script
Engine), `Workflow`/`WorkflowRun`/`WorkflowStepLog` extended in place
(Module 10 originals) plus new `WorkflowWebhookTrigger`, `Plugin` /
`PluginVersion` / `PluginInstallation` / `PluginRating` extended in place
(Module 10 Plugin Marketplace originals, now also carrying Module 13
artifact kinds), `AgentTask` / `AgentToolCallLog` extended in place
(Module 11 Orchestrator originals), `EvaluationRun` (AI Evaluation), and
`RelayCommand` (Local Execution). `AgentSdkRun`/`ScriptExecution` each got
a `@@index([workspaceId, createdAt])` in the Performance pass (task
#294) — see §21.

## 2. Shared package types + env config

`packages/shared/src/`: `mcp.ts` + `mcp-endpoints.ts` + `mcp-catalog.ts`
(JSON-RPC request/result types, `MCP_TOOL_NAMES`, `MCP_PROTOCOL_VERSION`,
resource-URI helpers), `agent-sdk.ts` + `agent-sdk-endpoints.ts`
(`AgentSdkDefinitionDto`, `AgentSdkRunDto`, `BUILTIN_AGENT_SLUGS`),
`script-engine.ts` + `script-engine-endpoints.ts` (`ScriptPermission`,
`SCRIPT_PERMISSIONS`, `ScriptLanguage`), `automation-engine.ts` (Module 10
original, extended with the new step/trigger kinds), `plugins.ts` +
`plugins-endpoints.ts` (Module 10 originals, extended), `evaluation.ts` +
`evaluation-endpoints.ts`, `relay-commands.ts` + `relay-commands-endpoints.ts`,
`ai-platform-observability.ts` + `-endpoints.ts`, `developer-portal.ts` +
`-endpoints.ts`. `errors.ts` gained `"MCP_TOOL_NOT_FOUND"`.
`env.validation.ts` gained `SCRIPT_ENGINE_TIMEOUT_MS` and
`SCRIPT_ENGINE_PYTHON_ENABLED` (the latter always `false` in this pass —
PYTHON scripts are rejected with `SCRIPT_LANGUAGE_NOT_EXECUTABLE`
regardless, since no Python sandbox exists yet).

## 3. MCP Server core

`apps/api/src/modules/mcp/mcp-rpc-dispatcher.service.ts` — one
`POST /mcp/rpc` endpoint (`mcp-rpc.controller.ts`) handling
`initialize`, `tools/list`, `tools/call`, `resources/list`,
`resources/read`, `prompts/list`, `prompts/get` as JSON-RPC 2.0. Sessions
(`mcp-sessions.controller.ts`, `McpSessionRepository`, `McpSession` table)
are API-key + scope scoped (`requireScope(ctx, 'tools'|'resources'|'prompts', ...)`);
`McpSessionCleanupService` reaps expired sessions on an interval.
`callTool()` records every invocation into `McpToolInvocation` (when
`ctx.sessionId` is present, for the audit trail) and — unconditionally,
audit trail or not — increments `MetricsRegistryService.mcpToolInvocationsTotal`/
observes `mcpToolInvocationDurationSeconds` (task #290 integration).

## 4. MCP Client

`packages/sdk-typescript/src/mcp-client.ts` — a dependency-free JSON-RPC
2.0 HTTP client against **any** MCP-compatible server, not just this
platform's own. Deliberately transport-minimal (HTTP+JSON-RPC only, no
stdio framing — see ADR 0013 §2). Exported from `@pentesthub/sdk`
alongside the pre-existing `HttpClient`/`PentestHubClient`
(Auth/Organizations/Distributed Jobs/Plugins/Integrations resources from
Module 10); `packages/cli`'s `mcp` command group is its first real
consumer.

## 5. MCP Resources

`mcp-resource-registry.service.ts` — thirteen read-only resource types
(`projects`, `targets`, `findings`, `evidence`, `reports`, `notes`,
`knowledge-base`, `recon-results`, `scanner-results`, `activity`,
`workspace-settings`, `ai-memory`, `rag-documents`), each a projection
over a table Modules 2/3/4/6/11 already own via `buildMcpResourceUri`/
`parseMcpResourceUri`-shaped URIs (e.g. `pentesthub://<workspace>/findings/<id>`).
Never writes.

## 6. MCP Tools

`mcp-tool-registry.service.ts` — every tool call dispatches an existing
`CommandBus`/`QueryBus` handler (`CreateProjectCommand`, `CreateTargetCommand`,
`CreateReconJobRequestDto`-backed recon trigger, `CreateVulnScanJobRequestDto`-backed
scan trigger, bug report generation/export, finding stage transitions,
`EnqueueRelayCommandCommand` for Local Execution, an `ask_ai` tool wired
through `AiProviderRegistryService`/`collectStreamedCompletion` from
Module 5) — no parallel business logic. `MCP_TOOL_NAMES` in
`packages/shared` is the single source of truth both the dispatcher and
the Script Engine's capability gate (§13) check membership against.

## 7. Prompt Registry

`mcp-prompt-registry.service.ts` — surfaces Module 11's `PromptTemplate`
table over `prompts/list`/`prompts/get`, read-only; creating/editing a
prompt stays on the existing `/ai/prompt-templates` REST surface.
`MCP_PROMPT_NAME_PREFIX` namespaces every exposed prompt name so it can't
collide with a third-party MCP server's own prompt catalog if a client
aggregates multiple servers.

## 8. AI Agent SDK

`packages/agent-sdk` — `AgentLifecycle` interface + `AgentRuntime`
executed against an `AgentRuntimeBackend` seam (`callTool`/resource read).
`apps/api/src/modules/agent-sdk`: `AgentSdkRegistryService` (bootstraps
the eleven built-ins into `AgentSdkDefinition` rows on module init, if
missing), `AgentSdkRunnerService` (`startRun()` for `BUILTIN` kind via
`LocalMcpContextAdapter`, `runCustom()` for `CUSTOM` kind via
`ScriptEngineService`), `LocalMcpContextAdapter` (implements
`AgentRuntimeBackend` directly against the in-process MCP registries — no
HTTP round-trip for built-ins, see ADR 0013 §3), `AgentSdkController`
(`POST /agent-sdk/runs`, rate-limited `@Throttle({limit:20,ttl:60_000})`
per task #293). Every run increments
`MetricsRegistryService.agentSdkRunsTotal` with `{kind, status}` labels.

## 9. Built-in agents (SDK-based)

Eleven agents, all instances of one `createPromptSpecialistAgent(config)`
factory (`packages/agent-sdk/src/builtin/{index,prompt-specialist-agent}.ts`):
Recon Agent, Web Pentest Agent, API Security Agent, Cloud Security Agent,
AD Assessment Agent, Code Review Agent, Threat Modeling Agent, Bug Bounty
Assistant, Report Writer, Knowledge Curator, Workflow Agent — each config
is a system prompt plus a `contextResourceType` (which MCP resource type
the agent looks at first). A compile-time guard in `builtin/index.ts`
fails the build if `CONFIGS` ever drifts from `BUILTIN_AGENT_SLUGS` in
`packages/shared`. `CUSTOM`-kind agents escape this template entirely and
run arbitrary `sourceCode` through the Script Engine.

## 10. Workflow Builder (visual automation)

Extends Module 10's `automation-engine` module in place rather than
forking a new one (ADR 0013 §5). New step kinds
(`workflow-executor.service.ts`): `parallel` (fan-out branches),
`approval` (pauses the run; `ApproveWorkflowStepCommand` — Team Lead+ —
resumes or rejects it), and an MCP-tool-call step type routing through
`McpToolRegistryService` so a workflow can invoke any registered MCP
tool. New trigger types: `WEBHOOK` (`workflow-webhook-trigger.controller.ts`,
`@Public()`, path-embedded token as credential — `WorkflowWebhookTrigger`
table) and `EVENT` (§11). `workflows.controller.ts` gained
`POST /:id/runs/:runId/approve` and the webhook-trigger CRUD endpoints.
Every terminal run still increments `workflowRunsTotal` (Module 10
original) and now also publishes `WorkflowRunStartedEvent`/
`WorkflowRunFinishedEvent`.

## 11. Event Bus expansion

Not a new pub/sub system — `@nestjs/cqrs`'s existing `EventBus`, with two
new publishers (`WorkflowRunStartedEvent`/`WorkflowRunFinishedEvent`,
`automation-engine/events/workflow-run-events.ts`; deliberately not an
`ActivityDomainEvent` since a `Workflow` can be organization-scoped with
no `workspaceId` at all) and one new generic subscriber
(`WorkflowEventTriggerHandler`) that looks up any `Workflow` with
`triggerType === 'EVENT'` matching the published event's key and starts a
run — the same "one handler, dispatch-by-name" shape Module 10's
`WebhookDispatchHandler` already established.

## 12. Plugin SDK

Extends Module 10's `plugins` module. `PluginSandboxService`
(`plugin-sandbox.service.ts`) runs a plugin version's hook source in a
`node:vm` context — the same hardened pattern the Script Engine uses (one
sandbox primitive, not two — ADR 0013 §4), gated by the plugin's declared
`permissions`. `plugin-signature.util.ts` verifies Ed25519 code signing
via Node's built-in `crypto.verify`/`createPublicKey` (pre-existing, real,
not a stub — confirmed with existing passing tests during the Security
pass, task #293). `dependency-resolution.util.ts` resolves a plugin's
declared dependency graph before install.

## 13. Script Engine

`apps/api/src/modules/scripts/script-engine.service.ts` — runs
`ScriptDefinition.sourceCode` (JavaScript; PYTHON always rejected with
`SCRIPT_LANGUAGE_NOT_EXECUTABLE`, see §2) in `node:vm`. The `vm.Script`
`timeout` option only bounds the synchronous top-level body; the actual
`main(input)` call races against a real `setTimeout`-based
`withTimeout()` for genuine wall-clock enforcement of async work
(confirmed by a real-timeout test, §22). A capability-gated `pentesthub`
global (currently `pentesthub.ai.ask`, routed through `McpToolRegistryService`)
is exposed only when the run's `permissions` include the matching
`ScriptPermission` (e.g. `ai:invoke`) — no ambient network/filesystem
access otherwise. `console.log` output is captured into `result.logs`
rather than hitting the host's real stdout. `RunScriptHandler`
(`scripts.commands.ts`) increments `scriptExecutionsTotal` with
`{status: SUCCEEDED|FAILED|TIMEOUT}` on every run. `sourceCode` is capped
at 80,000 characters (`@MaxLength`, task #293) as an explicit script-specific
ceiling layered on top of Express's default 100KB body-parser limit.

## 14. Automation Marketplace

Realized as the existing Module 10 Plugin Marketplace surface
(`plugins.controller.ts`, `plugin-installations.controller.ts`,
`plugin-ratings.commands.ts`/`RatePluginCommand`), now able to list and
install Module 13 artifact kinds (Agent SDK definitions, Script
definitions, Workflow templates) alongside plugins — one storefront, a
wider catalog, rather than a second marketplace with independent
install/rating bookkeeping (ADR 0013 §6).

## 15. Local Execution (Desktop Agent integration)

`apps/api/src/modules/relay-commands` — `RelayCommand` table +
`EnqueueRelayCommandHandler`/`CompleteRelayCommandHandler`
(`relay-commands.commands.ts`), `ListPendingRelayCommandsHandler`
(`relay-commands.queries.ts`), `RelayCommandsController`. Lets the
backend (or, via an MCP tool, any external MCP client) ask a user's
Desktop Agent (Module 7) or Browser Extension (Module 8) to execute
something locally: enqueue → target polls/streams and marks `DELIVERED` →
target reports back and the command is marked `COMPLETED`/`FAILED`.
Reuses those clients' existing bridge/sync channels rather than a new
transport. Every state transition increments `relayCommandsTotal` with
`{target, status}` labels.

## 16. AI Evaluation tools

`apps/api/src/modules/evaluation` — `AiEvaluationService` scores
agent/tool/script output against `EvaluationMetricType` (e.g.
`TOOL_SUCCESS_RATE`, `RESPONSE_QUALITY`), `RunEvaluationHandler`
persists an `EvaluationRun` row and increments `evaluationRunsTotal` with
`{metricType}`. `EvaluationController` exposes create/list. Feeds the
Observability dashboard's `evaluationRunsSummary` aggregation.

## 17. Observability

`MetricsRegistryService` (`apps/api/src/modules/observability`) added six
Prometheus series this module: `mcpToolInvocationsTotal`/
`mcpToolInvocationDurationSeconds` (Counter/Histogram pair),
`agentSdkRunsTotal`, `scriptExecutionsTotal`, `relayCommandsTotal`,
`evaluationRunsTotal` — instrumented at each surface's own command
handler/dispatcher (never polled), following `workflowRunsTotal`'s
existing Module 10 precedent. `AiPlatformObservabilityRepository` +
`GetAiPlatformObservabilityQuery` + `GET /observability/ai-platform`
(new this module) aggregate all six surfaces plus Workflow Runs into one
dashboard payload, resolved per-workspace. `ObservabilityModule` stays a
dependency-free leaf — every Module 13 feature module imports it for
`MetricsRegistryService`, never the reverse; the repository queries
`mcp_tool_invocations`/`agent_sdk_runs`/etc. directly via raw SQL rather
than injecting each module's own repository, to preserve that acyclic
wiring (ADR 0013's Consequences). A real, pre-existing bug in
`Histogram.render()` (double-cumulating already-cumulative bucket counts)
was found and fixed during the Tests pass — see §22.

## 18. Developer Portal

`apps/api/src/modules/developer-portal` — `GET /developer-portal/catalog`
(tools/resources/prompts from the three MCP registries),
`POST /developer-portal/tools/:toolName/try` (a real invocation, not a
dry-run; rate-limited `@Throttle({limit:15,ttl:60_000})`),
`GET /developer-portal/usage` (dispatches the same
`GetAiPlatformObservabilityQuery` §17 uses). Regular JWT-authenticated
REST, not a scope-gated MCP session — architecturally equivalent to
calling any other authenticated REST endpoint directly (ADR 0013 §8).

## 19. CLI

`packages/cli` (`@pentesthub/cli`, bin `pentesthub`) — zero external
CLI-framework dependency, built on `@pentesthub/sdk`'s `HttpClient` and
`@pentesthub/shared`'s endpoint constants. Commands: `login`/`logout`/
`whoami` (config at `~/.pentesthub/config.json`, mode `0600`, or
`PENTESTHUB_API_KEY`/`PENTESTHUB_BASE_URL` env vars), `mcp <list-tools|call>`,
`agents run`, `scripts run`, `observability`. See `packages/cli/README.md`
for disclosed limitations (no MFA support, no masked password input,
`mcp *` commands go through REST rather than a live MCP session).

## 20. Security — sandboxing, permissions, code signing

`node:vm` sandboxing (Script Engine §13, Plugin SDK §12) is the one
untrusted-code execution primitive in this codebase. Ed25519 plugin
signing (`plugin-signature.util.ts`) confirmed real and tested.
`@Throttle` route-level rate limits added to Agent SDK's `startRun`
(20/60s) and Developer Portal's `tryToolCall` (15/60s), layered on the
existing global default (`ThrottlerModule.forRoot`, 100/60s). Script
source capped at 80,000 characters. MCP's `tools/call` already
scope-gated (`requireScope`) from its original implementation.

## 21. Performance optimizations

`@@index([workspaceId, createdAt])` added to `AgentSdkRun` and
`ScriptExecution` (the latter had no workspace-leading index at all
before this pass) — both needed by the new Observability dashboard's
per-workspace, recency-windowed aggregation queries (§17).

## 22. Tests

Three new Jest spec files, written and reasoned through by hand (Jest
cannot execute even a single `apps/api` spec file within this sandbox's
command timeout — see ADR 0013's Verification section):
`script-engine.service.spec.ts` (9 tests — sync/async output, log
capture, missing-export rejection, real wall-clock timeout enforcement,
permission gating, PYTHON rejection, syntax-error rejection),
`metrics-registry.service.spec.ts` (4 tests — zero-sample rendering,
per-label-set counter increments, histogram bucket correctness — this
test is what caught the `Histogram.render()` double-cumulation bug,
fixed in the same pass — and multi-series isolation),
`ai-platform-observability.repository.spec.ts` (6 `describe` blocks
covering all six aggregation methods — bigint→number coercion, empty-row
defaults, and `workflowRunsSummary`'s actual status-bucketing/average-
duration logic over hand-built fake rows).

## 23. Documentation

This file, ADR 0013, `docs/releases/module-13-release-notes.md`,
`docs/mcp/mcp-guide.md`, and updates to `PROJECT_SPEC.md`/`README.md`.

## 24. Verification

See ADR 0013's "Verification constraints (sandbox)" section for the full
account: `packages/shared` re-verified clean via `tsc --noEmit` after
every shared-type change; `packages/cli` independently verified via a
manual `node_modules` symlink + direct `tsc --noEmit` (genuine clean
compile); `apps/api`-scale changes verified by manual cross-reference
against already-verified sibling files rather than compiled, consistent
with every module since Module 7's disclosed sandbox constraints.
