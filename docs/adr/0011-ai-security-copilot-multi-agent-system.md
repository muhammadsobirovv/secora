# 0011: AI Security Copilot + Autonomous Multi-Agent System (Module 11)

Status: Accepted — source-complete
Date: 2026-07-26

## Context

Module 5 gave the platform a workspace-aware AI chat assistant: one
conversation, one model turn at a time, with RAG and tool calling. Module
11's spec asks for something categorically different — a **Master AI
Orchestrator** that takes a free-text goal ("recon this target and draft a
findings summary"), decomposes it into a tree of subtasks, delegates each
subtask to one of twelve specialist agents (Recon, Web, API, Mobile, Cloud,
Active Directory, AI Research, Exploit Analysis, Report Writer, Code
Review, Risk Assessment, Workflow Coordinator), runs them with dependency
ordering and bounded concurrency, retries failures, merges outputs, and
produces a self-evaluated final report — an autonomous multi-agent system,
not a single chat turn. Around that core, the spec also asks for: a
searchable AI Knowledge Base (OWASP/CWE/CAPEC/MITRE ATT&CK/NIST/CVE), an
Explainability layer ("show your work" for every task), per-workspace
Privacy Mode controls (cloud/local/hybrid), and a set of narrower
enhancements to Module 5's existing AI Chat/Memory/Voice/Automation
surfaces. Nineteen subsystems (tasks #219-#237) plus tests and docs. This
ADR covers the decisions that span the module; narrower decisions live in
the file-level doc comments of the services they describe.

The standing instructions for this module were explicit: **do not rewrite
previous modules except where integration is required**, and **stop after
Module 11 is fully completed** — every decision below was made against
that constraint.

## Decision

### 1. `OrchestrationRun -> AgentTask -> AgentToolCallLog` as a new, additive domain — not a repurposing of `AiConversation`

Module 5's `AiConversation`/`AiMessage` model one human ↔ one assistant,
one message at a time. An orchestration run is structurally different: one
goal produces a *tree* of tasks (via `parentTaskId`, enabling Task
Delegation — a `WORKFLOW_COORDINATOR` task can itself propose further
sub-tasks up to `AI_ORCHESTRATOR_MAX_TASK_DEPTH`), each with its own
status lifecycle, retry count, reasoning summary, confidence score, and
tool-call log, independent of any single chat conversation. Rather than
bolting tree semantics onto `AiConversation` (which every Module 5/6/9
call site already assumes is flat), Module 11 adds four new tables
(`OrchestrationRun`, `AgentTask`, `AgentToolCallLog`, plus
`KnowledgeBaseReferenceEntry`) and a new `agent` module alongside the
existing `ai` module — additive in the same sense every prior module's
schema growth has been: no Module 5 table, column, or query shape changed.

### 2. Twelve specialist agents share one `PromptDrivenAgent` base, not twelve bespoke implementations

Every specialist agent (`ReconAgent`, `WebAgent`, ..., `WorkflowCoordinatorAgent`)
is a thin subclass supplying its own system prompt and allowed tool
subset; `PromptDrivenAgent.execute()` owns the actual model-call + tool-call
loop (budgeted at `MAX_AGENT_TOOL_CALLS = 3` per task, mirroring
`AiChatService`'s `MAX_TOOL_CALLS_PER_TURN` convention exactly) and the
defensive-JSON extraction (`extractAgentJson`/`clampConfidence` —
see `prompt-driven-agent.base.spec.ts`) every agent's final response goes
through. This is the same "one shared engine, many thin configurations"
shape Module 4's `ScannerRunner` and Module 3's `ToolRunner` established —
adding a 13th agent later means one new subclass, not touching the
execution loop.

### 3. The Orchestrator reuses Module 5's `AiProviderRegistryService`/tool-calling framework, doesn't fork them

`AgentOrchestratorService.planGoal()` and every `PromptDrivenAgent`
resolve their model through the exact same `AiProviderRegistryService`
Module 5/BYOK Phase 1 built — same 5-provider abstraction, same
workspace-BYOK-credential resolution, same `collectStreamedCompletion`
helper. Tool calling reuses Module 5's `AiToolRegistryService`/
`findToolCall` parser rather than a parallel agent-specific tool-call
format. This is the reuse the "don't rewrite previous modules" instruction
was written to encourage: Module 11 is a new consumer of Module 5's seams,
not a fork of them.

### 4. Explainability (task #233) is pure aggregation, not a new persisted concept

`AgentExplainabilityService.explainRun()` reshapes data every `AgentTask`/
`AgentToolCallLog` already persists (`reasoningSummary`, `confidenceScore`,
`sources`, each tool call's `input`/`output`) into one top-to-bottom
narrative (plan reasoning → per-task reasoning + evidence → overall
result) — no new table, no new write path. "Show your work" was true by
construction the moment task #223/#224 started recording that data; this
service exists so a caller doesn't have to reconstruct the narrative
themselves from the raw task tree.

### 5. AI Knowledge Base: exact/token-match ranking over the catalog itself, not semantic search — by design

`KnowledgeBaseReferenceService.search()` is plain relevance-ranked text
matching (exact code match scores 1; otherwise a normalized token-overlap
score) over the reference catalog, not an embedding-based nearest-neighbor
search. Deliberately: the catalog is a few hundred well-curated entries
with exact, well-known identifiers ("CWE-79", "T1190"), and a security
analyst or an agent citing one almost always knows the code or a close
paraphrase of the title — exact/substring matching is both cheaper (no
embedding API call per lookup) and more precise than approximate
nearest-neighbor search for that specific access pattern.
`reindexForSemanticSearch()` still exists as an explicit opt-in per
workspace for the case an agent *does* want the catalog folded into its
normal RAG recall (`AiMemoryService`) alongside findings/notes/recon data
in one unified semantic search — never run automatically, since embedding
the whole catalog costs one provider call per entry per workspace.

### 6. Privacy Mode (task #234): a real enforcement point, with an honestly narrower scope than ADR 0007's "local-first"

`AiPrivacyModeService`/`AiProviderRegistryService.resolveProvider()`
implement a genuine per-workspace `CLOUD`/`LOCAL`/`HYBRID` restriction at
the one seam every AI/agent call already passes through: `LOCAL` throws
`AiPrivacyModeViolationError` rather than silently falling back to a cloud
provider when nothing local is configured; `HYBRID` reorders the fallback
candidate list to try local providers first (though a configured default
provider still wins via the pre-existing default-provider shortcut — see
that service's own tests for this exact, intentional precedence); `CLOUD`
is unrestricted (today's Module 5 behavior, unchanged). This is a real,
enforced restriction — not a persisted preference nobody reads — but it is
explicitly **narrower** than ADR 0007's full "local-first" definition:
it only restricts *which backend AI provider* a request may use, not
Desktop-Agent-routing execution. A `LOCAL`-mode workspace still runs
inference against a provider from this server process (typically Ollama
reachable from it), not necessarily the user's own Desktop Agent. This gap
is disclosed here and in the service's own doc comment, not silently
narrowed without a trace.

### 7. Performance (task #235): fix real N+1s and unnecessary round-trips found by review, not speculative optimization

Four concrete issues were found and fixed by a dedicated research pass,
not by pre-emptively micro-optimizing: (a) the orchestration run's
`task_started` SSE event was calling the full `toTaskDto()` (two DB
round-trips: tool calls + sub-tasks) for a task that, being freshly
started, cannot yet have either — fixed with a `skipChildren` fast path;
(b) `AgentExplainabilityService.explainRun()` and
`AgentOrchestratorService`'s own run-detail view both independently
N+1'd one `listToolCallLogsForTask` query per task — fixed by one new
batched `listToolCallLogsForTasks(agentTaskIds)` repository method (a
single `WHERE "agentTaskId" IN (...)` round-trip) that both now share; (c)
`KnowledgeBaseReferenceService` was re-querying the full (small,
rarely-changing) catalog from the database on every single `search()`/
`listEntries()` call despite being a hot path (one agent tool call per
orchestration task) — fixed with an in-memory cache invalidated on
write, not time-based expiry, since the only writes are curation
actions/the one-time boot seed; (d) `AiMemoryService.upsertChunks()` was
issuing one `$executeRaw` INSERT per chunk in a loop when indexing long
content — fixed with one multi-row `VALUES (...), (...), ...` INSERT via
`Prisma.join`.

### 8. HTTP surface (task #236): CQRS commands/queries + SSE, matching every prior AI-adjacent controller exactly

Before task #236, `AgentOrchestratorService`/`KnowledgeBaseReferenceService`/
`AgentExplainabilityService` were reachable only via direct injection from
`AutomationEngineModule`'s `WorkflowExecutorService` (the `ai_agent_run`
workflow step) — no human user or frontend could start/inspect/explain a
run, or browse/search/curate the Knowledge Base, at all. `AgentRunsController`
and `KnowledgeBaseReferencesController` close that gap with the exact same
CQRS command/query dispatch (`CommandBus`/`QueryBus`) and `@Sse()`
live-stream-with-persisted-fallback pattern `AiConversationsController`
established in Module 5 — a run's stream endpoint checks an in-memory
`AgentOrchestrationStreamHubService` first, falling back to one final
synthetic event from the persisted `OrchestrationRun` if no live stream is
active. Domain events (`OrchestrationRunCreated/Completed/Failed/Cancelled`)
publish into the same single global `ActivityRecordingHandler` every other
module's events already flow through — no new event-handling
infrastructure.

### 9. Frontend (task #237): a distinct "Agent Copilot" surface from Module 5's "AI Assistant," not a merged UI

`/agent` (run list + start-a-run + live activity stream + task tree +
explainability tabs) and `/knowledge-base` (catalog browse/search) are new
top-level nav entries, deliberately separate from Module 5's existing
`/ai` chat page — a multi-step, multi-agent orchestration run has a
fundamentally different shape (a task tree that grows over minutes, not a
message that streams over seconds) than a chat turn, and conflating the
two UIs would have made both worse. The live activity panel reuses the
exact manual-`fetch()`-plus-`ReadableStream` SSE-consumption pattern
`useReconJobLogs` established in Module 3 (native `EventSource` can't
attach the required Bearer JWT header), and the run-detail page polls
`GetOrchestrationRun` the same way `useReconJob` polls a running scan —
the SSE stream is a live "what's happening right now" feed layered on top
of, not a replacement for, that polling-based authoritative state.

## Consequences

- **A second, deliberately distinct AI surface, not a Module 5 rewrite.**
  Every Module 5 table, endpoint, and UI page is unchanged. A workspace
  that never starts an orchestration run never encounters `agent` module
  code at all.
- **The Privacy Mode gap (point 6) is a disclosed, intentional scope
  boundary, not a defect** — but it is the one place in this module where
  a workspace operator's mental model ("LOCAL means nothing leaves my
  infrastructure") could diverge from actual behavior if the gap to ADR
  0007's Desktop-Agent-routing definition isn't read. Flagged here
  specifically so it isn't mistaken for solved.
- **Sandbox verification, disclosed honestly.** `packages/shared` and
  `apps/api`'s full `tsc --noEmit`/`eslint` were run to completion this
  pass via a detached-background-process technique
  (`setsid nohup ... & disown`, polled via separate tool calls) that
  worked reliably for the backend and confirmed zero compile/lint errors
  across every Module 11 backend file. The identical technique did **not**
  reproduce for `apps/web` in this session — background processes were
  observed to terminate between tool calls rather than persisting, and
  even a maximally-scoped `tsc` run (a handful of new files only) exceeded
  the available foreground command budget, consistent with this
  environment's mounted-filesystem I/O being the bottleneck rather than
  compute. The Module 11 frontend was instead verified by direct,
  systematic manual cross-reference of every new file's types, imports,
  and prop shapes against the real `@pentesthub/shared` DTOs and the
  actual signatures of every hook/component it calls (see
  `docs/modules/11-ai-security-copilot-multi-agent-system.md`'s
  verification section for the specific issue this caught and fixed: a
  tuple-inference bug in `new Map(array.map(...))` on the Knowledge Base
  page). This is a real, disclosed gap versus an automated `tsc` pass —
  not claimed as equivalent, and called out as the first thing a real
  verification pass (`ci.yml`, once runnable) should re-check.
- **Test coverage is real but intentionally scoped to the highest-risk
  logic, not exhaustive.** The `agent` module had zero test files before
  this pass (a fact this pass discovered mid-way, since directory-listing
  tools were unreliable in this sandbox session and had to be
  cross-checked via content search instead). New/fixed specs now cover:
  Privacy Mode enforcement end-to-end (the security-critical path — a
  regression here is a silent data-exfiltration risk, not just a broken
  feature), Explainability's tree-reconstruction and evidence
  summarization, Knowledge Base caching/invalidation/search-ranking,
  and the Orchestrator's pure/independently-testable logic (`mergeOutputs`,
  `cancel`/`retry`/`getRun`, the `toTaskDto` skipChildren fast path). Full
  end-to-end orchestration-run execution (a live model driving all twelve
  agents through a real task graph), and the narrower task #228-#232
  enhancements (autonomous recon/vuln analysis, incremental report
  writing, chat branching/bookmarks, voice copilot, workflow automation
  integration), do not have dedicated new specs in this pass — a
  disclosed next step, not an oversight.
