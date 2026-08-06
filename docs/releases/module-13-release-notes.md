# Module 13 Release Notes — AI Automation Platform + MCP Ecosystem + Security Agent SDK

Full decision record: `docs/adr/0013-ai-automation-platform-mcp-ecosystem.md`.
Implementation record: `docs/modules/13-ai-automation-platform-mcp-ecosystem.md`.
Protocol guide: `docs/mcp/mcp-guide.md`.

## Features added

**MCP Server** (`apps/api/src/modules/mcp`) — a standards-compliant Model
Context Protocol server over `POST /mcp/rpc`: `initialize`, `tools/list`,
`tools/call`, `resources/list`, `resources/read`, `prompts/list`,
`prompts/get`, API-key + scope-scoped sessions. Thirteen read-only
resource types, every tool call dispatching an existing `CommandBus`/
`QueryBus` handler, and Module 11's Prompt Registry surfaced read-only.

**MCP Client** (`packages/sdk-typescript/src/mcp-client.ts`) — a
dependency-free JSON-RPC 2.0 client against any MCP-compatible server,
now exported from `@pentesthub/sdk`.

**AI Agent SDK** (`packages/agent-sdk`, `apps/api/src/modules/agent-sdk`)
— an `AgentLifecycle`/`AgentRuntime` framework, eleven built-in prompt-
specialist agents (Recon, Web Pentest, API Security, Cloud Security, AD
Assessment, Code Review, Threat Modeling, Bug Bounty Assistant, Report
Writer, Knowledge Curator, Workflow Agent), and a `CUSTOM` agent kind that
runs user-supplied source through the Script Engine sandbox.

**Workflow Builder extensions** (`apps/api/src/modules/automation-engine`)
— `parallel`/`approval`/MCP-tool-call step kinds, `WEBHOOK` and `EVENT`
trigger types, an approval endpoint, layered onto Module 10's existing
workflow engine.

**Event Bus expansion** — `WorkflowRunStartedEvent`/
`WorkflowRunFinishedEvent` publishers plus a generic `EVENT`-trigger
subscriber, mirroring Module 10's webhook dispatch pattern.

**Plugin SDK** (`apps/api/src/modules/plugins`) — `PluginSandboxService`
(`node:vm`-based hook execution), confirmed-real Ed25519 code signing,
dependency-graph resolution — extending Module 10's Plugin Marketplace.

**Script Engine** (`apps/api/src/modules/scripts`) — sandboxed JavaScript
execution (`node:vm` + a real wall-clock `setTimeout` race for async
code), a capability-gated `pentesthub.*` global, `console.log` capture,
PYTHON rejection, an 80,000-character source cap.

**Automation Marketplace** — the existing Plugin Marketplace surface,
now listing Agent SDK definitions, Script definitions, and Workflow
templates alongside plugins.

**Local Execution** (`apps/api/src/modules/relay-commands`) — a relay
queue letting the backend (or an external MCP client) ask a user's
Desktop Agent or Browser Extension to run something locally.

**AI Evaluation** (`apps/api/src/modules/evaluation`) — scores
agent/tool/script output against a metric catalog, persists
`EvaluationRun` rows, feeds the Observability dashboard.

**Observability** — six new Prometheus series (MCP tool calls, Agent SDK
runs, Script executions, relay commands, evaluation runs) plus a new
`GET /observability/ai-platform` aggregation dashboard across all Module
13 automation surfaces.

**Developer Portal** (`apps/api/src/modules/developer-portal`) — a
browsable tool/resource/prompt catalog, a real (non-dry-run) "try it"
tool-call endpoint, and a usage dashboard — regular JWT-authenticated
REST, not an MCP session.

**CLI** (`packages/cli`, `@pentesthub/cli`) — `pentesthub login|logout|whoami`,
`mcp <list-tools|call>`, `agents run`, `scripts run`, `observability`,
built entirely on the existing `@pentesthub/sdk` and `@pentesthub/shared`
contracts, zero external CLI-framework dependency.

**Security** — route-level rate limits on Agent SDK `startRun` (20/60s)
and Developer Portal `tryToolCall` (15/60s); an explicit 80,000-character
cap on script source; confirmed the Ed25519 plugin-signing and MCP
scope-gating already in place from earlier passes are real, not stubs.

**Performance** — `@@index([workspaceId, createdAt])` added to
`AgentSdkRun` and `ScriptExecution` (the latter previously had no
workspace-leading index at all) for the new Observability dashboard's
per-workspace queries.

## Bugs found and fixed

- **`MetricsRegistryService`'s `Histogram.render()` double-cumulated
  bucket counts** — a real, pre-existing bug (not introduced this
  module) that silently corrupted every Prometheus histogram this
  codebase exposes, including the Module 10 HTTP-duration series.
  `observe()` already stores each bucket as the final cumulative "how
  many observations are `<=` this bucket" count; `render()` was summing
  those already-cumulative values a second time, producing bucket values
  that grew past `_count` and violated the exposition format's core
  invariant (`_bucket{le="+Inf"}` must equal `_count`). Found by hand-
  deriving expected values while writing `metrics-registry.service.spec.ts`,
  fixed by removing the erroneous second accumulation pass.
- **`scripts.commands.ts` metrics wiring left mid-edit after a session
  pause** — a constructor parameter was added without its import
  statement or `.inc()` calls; caught and completed immediately on
  resume, before any other Module 13 work continued.
- **CLI dispatcher mis-parsed `login --api-key <value>`** — an early
  draft's uniform `<group> <action>` token-based dispatch treated
  `--api-key` as if it were a second command word. Fixed with a
  `SINGLE_WORD_COMMANDS` special case for `login`/`logout`/`whoami`.

## Known limitations

- **`apps/api` could not be typechecked or unit-tested in this sandbox**
  — the same constraint disclosed in every module since Module 7 (~970
  files is too slow for this sandbox's per-command timeout; no `pnpm`
  binary and no registry access rule out a fresh install-based
  workaround). Every `apps/api` edit was manually cross-checked against
  already-verified sibling files instead. Three new spec files were
  written and reasoned through by hand but never executed.
- **PYTHON scripts are rejected unconditionally** — `ScriptLanguage.PYTHON`
  always returns `SCRIPT_LANGUAGE_NOT_EXECUTABLE`; no Python sandbox
  exists yet (`SCRIPT_ENGINE_PYTHON_ENABLED` is declared in config but
  has no effect in this pass).
- **MCP Client has no stdio transport** — HTTP+JSON-RPC only; a
  stdio-framed transport (for e.g. `pentesthub mcp connect --stdio <cmd>`)
  is deferred to the CLI layer if ever needed, not built into the
  portable SDK class.
- **The CLI's `mcp *` commands go through REST, not a live MCP session**
  — disclosed in `packages/cli/README.md`; no MFA support or masked
  password input in this pass either.

## Testing

New Jest spec files (written, manually verified against source, **not
executed** — see Known limitations):
`apps/api/src/modules/scripts/script-engine.service.spec.ts` (9 tests),
`apps/api/src/modules/observability/metrics-registry.service.spec.ts`
(4 tests, caught the histogram bug above),
`apps/api/src/modules/observability/ai-platform-observability.repository.spec.ts`
(6 `describe` blocks / 9 tests). `packages/cli` verified via a manual
`node_modules` symlink to sibling workspace packages plus a direct
`tsc -p tsconfig.json --noEmit` — genuine clean `EXIT:0` compile, the
first package in this project verified that way.

**Before merging, on a machine with `pnpm` and full network access,
run:** `pnpm install` → `pnpm --filter shared build` →
`pnpm --filter api prisma migrate deploy` (applies the Module 13
migration) → `pnpm build` → `pnpm lint` → `pnpm check-types` →
`pnpm test` → boot `apps/api` and exercise `POST /mcp/rpc` end-to-end
against a real MCP client.
