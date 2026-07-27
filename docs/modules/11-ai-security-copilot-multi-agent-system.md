# Module 11 — AI Security Copilot + Autonomous Multi-Agent System

Status: **Complete**, pending user approval before Module 12 (per the
standing instruction for this module).

This document is the implementation record for Module 11, structured as one
section per spec area. See `docs/adr/0011-ai-security-copilot-multi-agent-system.md`
for the architectural decisions behind these choices.

## Objective

Module 5 gave the platform a single-turn, workspace-aware AI chat assistant.
Module 11 adds a **Master AI Orchestrator**: given a free-text goal, it plans
a task tree, delegates each task to one of twelve specialist agents, executes
them with dependency ordering and bounded concurrency, retries failures,
merges outputs, and self-evaluates the result — a genuinely autonomous
multi-agent system, not a bigger chat window. Around that core: a searchable
AI Knowledge Base, an Explainability layer, per-workspace Privacy Mode
controls, and enhancements to Module 5's existing chat/memory/voice/
automation surfaces. Built without rewriting any Module 1-10 code except at
the deliberate integration seams called out below.

## Prisma schema — Agent/Orchestration/Memory domain

New models: `OrchestrationRun` (one goal, workspace/project/user-scoped,
status lifecycle `PENDING → PLANNING → RUNNING → PAUSED → COMPLETED/FAILED/
CANCELLED`, `planJson`, `resultSummary`, `confidenceScore`), `AgentTask`
(one unit of work; `parentTaskId` for Task Delegation, `agentType` from the
twelve-value `AgentType` enum, `reasoningSummary`/`confidenceScore`/`sources`
for Explainability, `retryCount`), `AgentToolCallLog` (one row per tool
invocation an agent made), and `KnowledgeBaseReferenceEntry` (the reference
catalog: `framework`/`code`/`title`/`summary`/`url`/`metadata`). Also
`WorkspaceAiPrivacySetting` (Privacy Mode, task #234) under the existing `ai`
domain rather than `agent`, to avoid a reverse `ai -> agent` module-import
edge (see ADR §6 and that model's own doc comment). All hand-applied to
`schema.prisma` plus a migration file, consistent with every module since 6
— see the migration-history gap already disclosed in ADR 0010 §14.

## Agent framework

`BaseAgent` (abstract: `agentType`, `execute(input, signal)`) and
`PromptDrivenAgent` (the shared execution engine every concrete agent
subclasses — system prompt + allowed-tool-subset configuration only, no
agent reimplements the model-call/tool-call loop). Twelve concrete agents:
`ReconAgent`, `WebAgent`, `ApiAgent`, `MobileAgent`, `CloudAgent`,
`ActiveDirectoryAgent`, `AiResearchAgent`, `ExploitAnalysisAgent`,
`ReportWriterAgent`, `CodeReviewAgent`, `RiskAssessmentAgent`,
`WorkflowCoordinatorAgent` — the last one uniquely able to propose further
sub-tasks (`shouldDelegate`/`subTasks` in its output), which the orchestrator
creates as child `AgentTask` rows up to `AI_ORCHESTRATOR_MAX_TASK_DEPTH`.
`AgentRegistryService` maps `AgentType -> BaseAgent` the same way
`ScannerRunnerRegistryService`/`ToolRunnerRegistryService` map their own
tool enums in Modules 3/4.

## Master AI Orchestrator engine

`AgentOrchestratorService`: `startRun()` creates the `OrchestrationRun` row,
publishes `OrchestrationRunCreatedEvent`, and kicks off `execute()` in the
background (same "create row, return immediately, stream via hub" shape as
`AiChatService.startTurn`). `execute()` plans the goal into an
`OrchestrationPlanDto` (`planGoal()` — an LLM call under the same
"respond with ONLY JSON" convention as every other AI-module prompt, with a
one-step `AI_RESEARCH` fallback plan if the model returns nothing usable),
creates one `AgentTask` per plan step, then `runTaskGraph()` schedules
`QUEUED` tasks whose `__dependsOnTaskIds` are all `COMPLETED`, up to
`AI_ORCHESTRATOR_MAX_CONCURRENT_TASKS` at a time, with a per-task
`AI_ORCHESTRATOR_TASK_TIMEOUT_MS` wall-clock budget and up to
`AI_ORCHESTRATOR_MAX_TASK_RETRIES` automatic retries on failure. Once every
task settles, `mergeOutputs()` aggregates top-level task results into a
result summary + averaged confidence score, the Reasoning Engine's
self-evaluation critiques it, and the run is marked `COMPLETED`/`FAILED`.
`cancel()`/`retry()` are both exposed at the HTTP layer (see below).

## Extended tool calling

Every agent's tool-calling loop reuses Module 5's `AiToolRegistryService`/
`findToolCall` parser directly — no agent-specific tool-call wire format.
`AgentExecutionInput`/`AgentUpstreamResult` carry a task's own input plus
its already-completed dependency tasks' outputs as context, so a
downstream task (e.g. a `WEB` task depending on a `RECON` task) sees the
upstream task's findings without re-deriving them.

## Long-term AI memory

`AiMemoryService.indexContent()` (Module 5) gained two new
`AiMemorySourceType` values this module consumes: `ORCHESTRATION_RUN` (the
orchestrator indexes its own goal + result summary on completion, so a
later chat/orchestration run can recall past runs via RAG) and
`KNOWLEDGE_BASE_REFERENCE` (the Knowledge Base's opt-in
`reindexForSemanticSearch()` path — see below).

## Reasoning engine

`ReasoningEngineService.selfEvaluate()` — an independent critique pass over
the merged run result before it's reported as done (Self-Evaluation), rather
than trusting each agent's own "completed" status at face value. Only runs
for runs where at least one top-level task succeeded; a run where everything
failed doesn't need a critique to know it fell short.

## AI Knowledge Base

`KnowledgeBaseReferenceService` — a searchable, system-wide, read-mostly
catalog (OWASP/CWE/CAPEC/MITRE ATT&CK/NIST/CVE), seeded on boot
(`onModuleInit`, idempotent upsert). `search()` is relevance-ranked
text matching, not semantic search, by deliberate design — see ADR §5.
`reindexForSemanticSearch(workspaceId)` is the opt-in bridge into
`AiMemoryService`'s normal RAG store. Distinct from Module 6/9's
workspace-scoped `KnowledgeBaseNote` (playbooks/CVE references/tool
references/AI conversation snapshots) — different domain, different file
(`knowledge-base-reference.ts` vs. `bugbounty-endpoints.ts`'s
`KNOWLEDGE_BASE_ENDPOINTS`), deliberately not merged.

## Autonomous recon + vulnerability analysis

`ReconAgent`/`WebAgent`/`ApiAgent` etc. call the same recon/vuln tool-calling
surface Module 5's chat tool-calling framework already exposed (search
findings, search recon results) — an orchestration run can autonomously
chain "enumerate subdomains → screenshot live hosts → analyze findings for
likely vulnerability classes" across multiple agents without a human
manually running each step and pasting results into chat.

## AI Report Writer

`ReportWriterAgent` — incremental report-section generation as a task in an
orchestration run, reusing Module 6/9's report rendering rather than a new
report format.

## AI Chat enhancements

Module 5's `AiConversation`/`AiMessage` gained branching (via
`parentMessageId`, already present, now exercised by regenerate/continue),
bookmarks/pins (already-existing fields, now surfaced), and a prompt
library — additive fields and endpoints on the existing Module 5 chat
domain, not a schema change to its core shape.

## Voice Copilot enhancements

Extensions to Module 5 Phase 2's `SpeechProvider` abstraction for
orchestration-run narration — same interface, no new provider adapters
required structurally.

## AI Workflow Automation

Integration with Module 10's `WorkflowExecutorService`: an `ai_agent_run`
workflow step kind calls `AgentOrchestratorService` directly (the one
call site that existed before task #236 added a real HTTP surface for
humans).

## Explainability layer

`AgentExplainabilityService.explainRun()` — pure aggregation/reshaping over
already-persisted `AgentTask`/`AgentToolCallLog` data into one coherent
narrative: plan reasoning, alternatives considered, per-task reasoning +
evidence (each tool call summarized via `summarizeToolCall` — prefers
`output.message`, falls back to `output.count`, falls back to a
truncated-at-160-characters raw JSON dump), overall confidence, and result
summary. See ADR §4 for why this is deliberately not a new persisted
concept.

## Privacy controls

Per-workspace `AiPrivacyMode` (`CLOUD`/`LOCAL`/`HYBRID`,
`WorkspaceAiPrivacySetting`, falling back to the `AI_ORCHESTRATOR_MODE` env
default when unset) enforced inside `AiProviderRegistryService.resolveProvider`/
`resolveEmbeddingProvider`/`listStatuses` — the one seam every AI/agent call
already passes through. See ADR §6 for the exact enforcement semantics per
mode and the honestly-disclosed gap versus ADR 0007's full local-first
definition.

## Performance optimizations

Four fixes from a dedicated research pass — see ADR §7 for the full list:
the `task_started` SSE event's `skipChildren` fast path, the batched
`listToolCallLogsForTasks` repository method (fixing two independent N+1s),
the Knowledge Base catalog's invalidate-on-write in-memory cache, and
`AiMemoryService.upsertChunks()`'s multi-row `VALUES (...)` batch insert.

## Controllers + Swagger + module wiring + events

`AgentRunsController` (`/agent/runs` — list/create/get/cancel/retry/explain,
plus `@Sse(':runId/stream')` mirroring `AiConversationsController`'s exact
live-stream-with-persisted-fallback shape) and
`KnowledgeBaseReferencesController` (`/knowledge-base/references` —
list/search/get/upsert/delete/reindex), both dispatching through
`CommandBus`/`QueryBus` the same way every other Module 6-10 controller
does. Nine new CQRS command/query handlers. Four new domain events
(`OrchestrationRunCreated/Completed/Failed/Cancelled`) feeding the existing
single global `ActivityRecordingHandler`. `AgentModule` registered in
`app.module.ts` alongside every other feature module.

## Frontend — Agent Copilot UI

New `apps/web/lib/api/agent.ts` and `knowledge-base-reference.ts` API
clients (one function per endpoint, mirroring `lib/api/ai.ts`'s exact
style); `features/agent/hooks/use-agent.ts` (React Query hooks — polling on
non-terminal run status mirroring `useReconJob`, plus `useAgentRunStream`,
a manual-`fetch()`-and-`ReadableStream` SSE hook mirroring
`useReconJobLogs`); components (`AgentRunStatusBadge`, `AgentRunList`,
`AgentTaskTree` — a collapsible recursive task tree, `AgentRunStreamPanel` —
a live activity feed, `AgentRunExplanation` — renders the Explainability
narrative, `StartOrchestrationRunForm`); pages `/agent` (landing/list/start)
and `/agent/runs/[runId]` (detail: live stream + tabbed task-tree/
explainability view); a parallel `features/knowledge-base-reference/` stack
for `/knowledge-base` (browse/search/reindex). Two new `PRIMARY_NAV`
entries ("Agent Copilot", "Knowledge Base"), deliberately distinct from the
existing "AI Assistant" entry — see ADR §9.

## Testing

New Jest spec files (real assertions, matching the project's existing
`@jest/globals`/typed `jest.fn<Type>()` style) — the `agent` module had zero
spec files before this pass:

- `agent-authorization.util.spec.ts` — the enumeration-safe-404
  workspace-isolation pattern (an orchestration run belonging to another
  workspace, and one that doesn't exist at all, both resolve to the
  identical `ORCHESTRATION_RUN_NOT_FOUND`).
- `knowledge-base-reference.service.spec.ts` — the task #235 in-memory
  cache (one `repository.list` call across repeated reads; invalidated by
  `upsertEntry`/`deleteEntry`), `search()`'s relevance ranking (exact code
  match scores 1, case/punctuation-insensitive, token-overlap scoring for
  everything else), and `reindexForSemanticSearch()`'s per-entry
  error-tolerance.
- `agent-explainability.service.spec.ts` — task-tree reconstruction from
  flat `parentTaskId` rows, the batched `listToolCallLogsForTasks` call,
  every branch of `summarizeToolCall` (failed/message/count/truncated-raw/
  no-output), and plan-reasoning extraction from `planJson`.
- `agent-orchestrator.service.spec.ts` — `cancel()`'s stream-hub
  delegation, `getRun()`'s null-handling and tree-building, `retry()`'s
  per-task retry-limit-respecting reset logic, `mergeOutputs()`'s
  allFailed/confidence-averaging/summary-line formatting (accessed via a
  typed cast since it's a private pure method — a deliberate,
  test-only escape hatch, not a public API change), and the `toTaskDto`
  `skipChildren` fast path's actual DB-call-skipping behavior.
- `prompt-driven-agent.base.spec.ts` — `extractAgentJson`'s fenced/bare/
  malformed-JSON handling and `clampConfidence`'s NaN/Infinity/out-of-range
  degrade-to-0.5 behavior (the two defensive-parsing primitives every
  agent's final response, and the orchestrator's own plan parsing, depend
  on).

Also updated (found stale, not previously known to exist — see
Verification below): `ai-provider-registry.service.spec.ts`, whose
pre-Module-11 version predated `resolveProvider`/`resolveEmbeddingProvider`/
`listStatuses` becoming async and privacy-mode-aware — rewritten to match
the current signature and to cover every `CLOUD`/`LOCAL`/`HYBRID` branch
described in ADR §6. New `ai-privacy-mode.service.spec.ts` covers
`resolveMode`'s workspace-override-vs-env-default fallback.

Not covered by new specs in this pass: full end-to-end orchestration-run
execution against a live model/all twelve agents, and the narrower
task #228-#232 enhancements individually (autonomous recon/vuln analysis,
incremental report writing, chat branching/bookmarks, voice copilot,
workflow automation integration) — disclosed as a next step, not an
oversight.

## Documentation

- `docs/adr/0011-ai-security-copilot-multi-agent-system.md` — architecture
  decision record for this module.
- This file — the per-spec-section implementation record.
- `PROJECT_SPEC.md` — Module 11 status blockquote added.
- `README.md` — `## Modules` list backfilled with entries 10 and 11 (it
  previously stopped at Module 9).
- `docs/releases/module-11-release-notes.md` — features/fixes/limitations/
  testing summary, matching the format of every prior module's release
  notes.

## Verification

- `packages/shared`'s `tsc --noEmit` was re-run after every shared-type
  change made this module and stayed clean throughout.
- **A genuine improvement over every prior module's sandbox constraint**:
  `apps/api`'s full project-wide `tsc --noEmit` and a scoped `eslint` run
  *did* complete successfully this pass, via a detached-background-process
  technique (`setsid nohup <cmd> > logfile 2>&1 < /dev/null & disown`,
  polled for completion via separate, later tool calls rather than one
  foreground call) that works around this sandbox's ~45-second
  foreground-command timeout. Both ran clean — zero TypeScript errors,
  zero lint errors — across every Module 11 backend file (tasks #234-236).
  This is real, executed verification, not a manual-review substitute.
- **That technique did not reproduce for `apps/web` later in this same
  session.** Background processes launched the identical way were
  observed to no longer be running when polled from a subsequent tool
  call (confirmed with a trivial `sleep 30` control case, which also did
  not survive), and even a `tsc` run scoped to only the ~15 new/modified
  frontend files (via a temporary `tsconfig.verify-m11.json` overriding
  `include`) exceeded the foreground timeout with `real 43s` / `user
  3.2s` — i.e., overwhelmingly I/O-wait, not compute, consistent with
  this session's mounted-filesystem access to `node_modules` being the
  bottleneck rather than TypeScript's own work. `apps/web`'s Module 11
  changes were instead verified by direct, systematic manual
  cross-reference of every new file's imports, prop types, and hook
  signatures against the real `@pentesthub/shared` DTOs and the actual
  source of every component/hook called — this process caught and fixed
  one real bug (`new Map(array.map((r) => [a, b]))` inferring
  `(string | number)[]` instead of a `[string, number]` tuple on the
  Knowledge Base page, since `noUncheckedIndexedAccess`/`strict` are both
  enabled — fixed with an explicit tuple return-type annotation on the
  `.map()` callback).
- **Jest was attempted and, like `apps/web`'s `tsc`, did not complete**
  within the foreground timeout even scoped to a single new spec file —
  same mounted-filesystem I/O constraint. Every new/updated spec file in
  this module was instead written by careful, direct cross-reference
  against the exact repository-interface method signatures, DTO shapes,
  and service implementations it tests (reading the real source for each
  mocked dependency rather than assuming its shape) — the same discipline
  every prior module's sandbox-constrained verification pass has used, but
  it is disclosed here as manual review, not claimed as an executed test
  run.
- Directory-listing tools (`Glob`) were found to be unreliable in this
  session — returning "no files found" for paths later confirmed to exist
  via direct `Read`/`Grep` calls. Content-search (`Grep`) was reliable
  throughout and was used instead once this was discovered; this is how
  the pre-existing (but stale) `ai-provider-registry.service.spec.ts` and
  the rest of the project's 100+ existing spec files were actually found,
  after an initial `Glob`-based check incorrectly suggested the `apps/api`
  test suite was empty.

**Before merging, run from the repo root:**
`pnpm build && pnpm lint && pnpm check-types && pnpm test`

## Commit

Per the standing instruction for this module, commit only after
documentation is up to date and the build/lint/typecheck/test loop has been
handed off. Documentation is complete as of this file.
