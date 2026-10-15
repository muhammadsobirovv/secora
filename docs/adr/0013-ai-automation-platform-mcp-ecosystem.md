# ADR 0013 — AI Automation Platform + MCP Ecosystem + Security Agent SDK

## Status

Accepted (source-complete; verification loop constrained by sandbox
toolchain limits already established in prior modules — see §9).

## Context

Modules 1-12 built Secora AI into a full pentest/bug-bounty product
with three first-class clients (`apps/web`, `apps/desktop`, `apps/mobile`)
and, as of Module 11, a Master AI Orchestrator that runs twelve built-in
agents inside this codebase. What none of that offers yet is a way for
**outside** software — a third-party AI application, a script a customer
writes themselves, another vendor's agent framework — to act on a
workspace's data and tools without Secora having to hand-write a
bespoke integration for each one. Module 13 closes that gap by adopting
the **Model Context Protocol (MCP)** as the platform's extensibility
substrate, and building the automation surfaces (agents, workflows,
plugins, scripts, a marketplace, an evaluation harness, a CLI, a
Developer Portal) that make an MCP server actually useful rather than a
protocol nobody calls.

## Decisions

**1. MCP as the extensibility substrate, not a bolt-on API.** `McpModule`
(`apps/api/src/modules/mcp`) implements MCP's JSON-RPC 2.0 methods
(`initialize`, `tools/list`, `tools/call`, `resources/list`,
`resources/read`, `prompts/list`, `prompts/get`) over one
`POST /mcp/rpc` endpoint, session-scoped via `mcp_sessions` and an API-key
+ scope model (`requireScope(ctx, 'tools', ...)`). Three registries back
it: `McpToolRegistryService` (task #279 — actions, each one dispatching an
existing `CommandBus`/`QueryBus` handler rather than a parallel code
path), `McpResourceRegistryService` (task #278 — read-only projections
over tables Modules 2/4/6/11 already own), and `McpPromptRegistryService`
(task #280 — surfaces Module 11's `PromptTemplate` table). Nothing in
this trio duplicates business logic; each is a translation layer from
MCP's shape to a capability the platform already has.

**2. A transport-minimal `McpClient` (task #277,
`packages/sdk-typescript/src/mcp-client.ts`) makes the platform an MCP
*consumer* too, not just a server.** It speaks JSON-RPC 2.0 over HTTP
against any compliant MCP server, Secora's own or a third party's —
the literal implementation of the spec's "communicate with any
MCP-compatible AI application" requirement. Deliberately excludes a
stdio transport (Node's `child_process` piping is CLI-specific plumbing,
not something a browser/Node-portable SDK class should own); the CLI's
`mcp` command group is where that would layer on if ever needed.

**3. The AI Agent SDK treats "an agent" as data plus one shared runtime,
not eleven bespoke classes.** `packages/agent-sdk`'s `AgentLifecycle`
interface and `AgentRuntime` (task #281) are executed against an
`AgentRuntimeBackend` seam with two implementations: `LocalMcpContextAdapter`
(built-in agents, calls straight into `McpToolRegistryService`/
`McpResourceRegistryService` in-process) and an HTTP-based backend for
external SDK consumers going through `/mcp/rpc`. The eleven built-in
agents (task #282 — Recon, Web Pentest, API Security, Cloud Security, AD
Assessment, Code Review, Threat Modeling, Bug Bounty Assistant, Report
Writer, Knowledge Curator, Workflow Agent) are all instances of one
`createPromptSpecialistAgent(config)` factory, parametrized by a system
prompt and a context resource type — see `packages/agent-sdk/src/builtin/index.ts`.
A `CUSTOM`-kind agent (registered with its own `sourceCode`) escapes that
template entirely and runs through the Script Engine's sandbox instead.
This mirrors Module 11's own precedent (twelve specialist agents sharing
one orchestrator) rather than inventing a second agent shape.

**4. The Script Engine is the one code-execution primitive both Custom
Agents and the Plugin SDK build on.** `ScriptEngineService`
(`apps/api/src/modules/scripts`, task #286) runs untrusted JavaScript in
a `node:vm` context: the `vm.Script` `timeout` option only bounds the
synchronous top-level body (which just assigns `module.exports.main`),
so a real host-side `setTimeout` race (`withTimeout()`) is what actually
bounds the async `main(input)` call's wall-clock budget. A
capability-gated `pentesthub` global (e.g. `pentesthub.ai.ask`, present
only when the run was granted the `ai:invoke` `ScriptPermission`) is the
only way a script reaches the platform at all — no ambient
`fetch`/`require`/filesystem access. `PluginSandboxService` (task #285)
reuses the identical `node:vm` + host-timeout pattern for plugin hook
execution, so there is exactly one hardened execution primitive in this
codebase, not two independently-reasoned-about sandboxes.

**5. Workflow Builder extends Module 10's existing `automation-engine`
module rather than forking a new one.** Module 10 already had
`Workflow`/`WorkflowRun` and a step executor; Module 13 (task #283) adds
`parallel`/`approval`/MCP-tool-call step kinds, a `WEBHOOK` trigger type
(`workflow-webhook-trigger.controller.ts`, `@Public()` — the
path-embedded token is the credential, the same trust model every other
inbound provider webhook in this codebase already uses), and an `EVENT`
trigger type consumed by `WorkflowEventTriggerHandler` (task #284). Event
Bus expansion is therefore not a new pub/sub system — it is `@nestjs/cqrs`'s
existing `EventBus`, now with two more publishers (`WorkflowRunStartedEvent`/
`WorkflowRunFinishedEvent`) and one more generic `@EventsHandler` subscriber,
mirroring `WebhookDispatchHandler`'s established "one handler, dispatch by
event-name lookup" shape from Module 10's webhook system.

**6. The Automation Marketplace is the Plugin system's browse/install/rate
surface, not a separate catalog.** Module 10 already introduced a Plugin
Marketplace (`plugins` module, `PluginInstallation`). Module 13's
"Automation Marketplace" (task #287) is realized as the same
`plugins.controller.ts`/`plugin-installations.controller.ts`/
`plugin-ratings.commands.ts` surface, now able to list and install the
new Module 13 artifact kinds (Agent SDK definitions, Script definitions,
Workflow templates) alongside the plugins it already carried — one
marketplace, a wider set of listable things, rather than a second
storefront with its own install/rating logic to keep in sync.

**7. Local Execution is a relay queue, not a second sync engine.**
`RelayCommandsModule` (task #288) gives the backend a way to ask the
Desktop Agent (Module 7) or Browser Extension (Module 8) to run something
locally — enqueue a command, the target polls/streams and marks it
delivered, then completes it with a result. It deliberately reuses those
two clients' existing bridge/sync channels rather than inventing a new
transport; `RelayCommandsRepository` and `EnqueueRelayCommandCommand` are
the entire new surface, exposed to MCP as a tool
(`McpToolRegistryService` dispatches `EnqueueRelayCommandCommand`
directly) so an external MCP client can ask a user's own machine to run a
local tool without knowing the Desktop Agent protocol exists.

**8. AI Evaluation, Observability, and the Developer Portal form one
closed feedback loop.** `AiEvaluationService` (task #289) scores
agent/tool output against a metric catalog (`EvaluationMetricType`) and
persists `EvaluationRun` rows; `MetricsRegistryService` (task #290) adds
six Prometheus counter/histogram series — one pair per Module 13
automation surface (MCP tool calls, Agent SDK runs, Script executions,
relay commands, evaluation runs) — instrumented at each surface's own
command handler, the same "increment where the outcome is actually known"
posture `workflowRunsTotal` already established in Module 10; and
`AiPlatformObservabilityRepository`/`GET /observability/ai-platform`
(also task #290) aggregates all of it into one dashboard query. The
Developer Portal (task #291, `GET /developer-portal/catalog`,
`POST /developer-portal/tools/:toolName/try`, `GET /developer-portal/usage`)
is a regular JWT-authenticated REST surface over the exact same
registries and the same observability query — not a second,
scope-gated MCP-session surface — because a portal user is a logged-in
workspace member browsing their own workspace's tools, architecturally
equivalent to any other authenticated REST endpoint, not an MCP client
that needs scope delegation.

**9. `packages/cli` is a dependency-free `@pentesthub/cli`, not a wrapper
around a third-party CLI framework.** `pentesthub login|whoami|logout`,
`pentesthub mcp <list-tools|call>`, `pentesthub agents run`,
`pentesthub scripts run`, `pentesthub observability` all go through the
same `@pentesthub/sdk`'s exported `HttpClient` and `@pentesthub/shared`'s
endpoint constants that every other client (`apps/web`, the Python/Go
SDKs from Module 10) already depends on — zero new "how does this talk to
the API" logic. Config lives at `~/.pentesthub/config.json` (mode `0600`)
or `PENTESTHUB_API_KEY`/`PENTESTHUB_BASE_URL` env vars, the same two-tier
precedent Module 10's SDKs established.

## Consequences

- The platform now has a genuine plugin/extension surface — MCP is a
  published, versioned protocol other vendors' tooling already speaks,
  not a Secora-specific bolt-on, so the integration cost for a new
  external AI tool to reach a workspace's projects/findings/tools is
  "point an MCP client at `/mcp/rpc`", not a bespoke connector.
- `ObservabilityModule` had to become a strict dependency-free leaf: every
  Module 13 feature module now imports it for `MetricsRegistryService`,
  and it must never import any of them back. `AiPlatformObservabilityRepository`
  queries `mcp_tool_invocations`/`agent_sdk_runs`/etc. directly via raw SQL
  rather than injecting each module's own repository, to preserve that
  invariant — a few duplicated query lines traded for guaranteed
  acyclic module wiring.
- `node:vm` sandboxing (Script Engine, Plugin SDK) is now this codebase's
  one and only untrusted-code execution primitive, and its correctness
  bar is proportionately higher: both the async wall-clock timeout and the
  capability-gated global surface are load-bearing security controls, not
  incidental implementation details.
- A fourth and fifth workspace package (`packages/agent-sdk`,
  `packages/cli`) now exist alongside `packages/sdk-typescript`,
  widening the set of consumers `packages/shared`'s DTOs/endpoint
  constants must stay compatible with — the same "N clients depend on one
  contract package" concern ADR 0012 raised for `apps/mobile`, now with
  N=6 (web, desktop, mobile, TypeScript SDK, agent-sdk, cli).
- Sandbox verification for `apps/api`-scale changes remained infeasible
  here (see §9 below) — the same constraint every module since Module 10
  has disclosed. `packages/cli`, being small and freestanding, could be
  independently `tsc`-verified via a manual `node_modules` symlink
  technique; that technique is now a reusable playbook for any future
  small package addition in this sandbox.

## Verification constraints (sandbox)

Consistent with every module since Module 7: `apps/api`'s ~970-file
TypeScript project is too slow to fully `tsc`/`jest` in this sandbox's
per-command timeout, and `pnpm install` cannot run here at all (no
`pnpm` binary, no registry network access). Every `apps/api` edit this
module was manually cross-checked against already-verified sibling files
(exact method signatures, `schema.prisma` relation/field names,
established constructor/import conventions) rather than compiler-verified.
`packages/shared` was re-verified clean (`tsc --noEmit`) after every
shared-type change, as in every prior module. `packages/cli` was
additionally verified via a manual `node_modules` symlink to sibling
workspace packages plus a direct `tsc -p tsconfig.json --noEmit` run —
a genuine, if non-standard, clean compile. Three new Jest spec files
(`script-engine.service.spec.ts`, `metrics-registry.service.spec.ts`,
`ai-platform-observability.repository.spec.ts`) were written and reasoned
through by hand against the real implementation rather than executed —
`apps/api` Jest could not run a single spec file within this sandbox's
45-second command timeout, confirmed by direct experimentation (including
verifying that background/`nohup` processes do not persist across
separate tool invocations here). This manual-tracing pass caught one real,
pre-existing bug: `MetricsRegistryService`'s `Histogram.render()` was
double-summing already-cumulative per-bucket counts, silently corrupting
every histogram this codebase exposes (including the Module 10
`httpRequestDurationSeconds` series) — found while hand-deriving expected
values for the new histogram test, fixed by removing the erroneous second
accumulation pass.
