# Module 11 Release Notes — AI Security Copilot + Autonomous Multi-Agent System

Full decision record: `docs/adr/0011-ai-security-copilot-multi-agent-system.md`.
Implementation record: `docs/modules/11-ai-security-copilot-multi-agent-system.md`.

## Features added

**Master AI Orchestrator** — `AgentOrchestratorService`: give it a free-text
goal, it plans a task tree, delegates to specialist agents with dependency
ordering and bounded concurrency (`AI_ORCHESTRATOR_MAX_CONCURRENT_TASKS`),
retries failed tasks (`AI_ORCHESTRATOR_MAX_TASK_RETRIES`), respects a
per-task timeout budget (`AI_ORCHESTRATOR_TASK_TIMEOUT_MS`), and self-
evaluates the merged result before marking the run complete.

**Twelve specialist agents** — Recon, Web, API, Mobile, Cloud, Active
Directory, AI Research, Exploit Analysis, Report Writer, Code Review, Risk
Assessment, and Workflow Coordinator (uniquely able to delegate further
sub-tasks up to `AI_ORCHESTRATOR_MAX_TASK_DEPTH`), all sharing one
`PromptDrivenAgent` execution engine.

**AI Knowledge Base** — a searchable OWASP/CWE/CAPEC/MITRE ATT&CK/NIST/CVE
reference catalog, seeded on boot, with relevance-ranked search (exact code
match ranks first) and an opt-in bridge into per-workspace semantic RAG
recall.

**Explainability layer** — `AgentExplainabilityService.explainRun()`
reshapes an orchestration run's already-persisted reasoning/confidence/
sources/tool-call data into one top-to-bottom "why did the system conclude
this" narrative — no new persisted concept, pure aggregation.

**Privacy Mode controls** — per-workspace `CLOUD`/`LOCAL`/`HYBRID`
enforcement inside `AiProviderRegistryService`: `LOCAL` refuses to fall back
to a cloud provider (throws rather than silently using one); `HYBRID`
prefers local providers in its fallback ordering; `CLOUD` is unrestricted.
Real enforcement at the one seam every AI/agent call passes through, with an
honestly disclosed narrower scope than ADR 0007's full local-first
definition — see that ADR's §6.

**Performance optimizations** — a `skipChildren` fast path for the
`task_started` SSE event, one new batched `listToolCallLogsForTasks`
repository method fixing two independent N+1 query patterns, an
invalidate-on-write in-memory cache for the Knowledge Base catalog, and a
multi-row batch insert for long-content memory chunking.

**HTTP API** — `AgentRunsController` (`/agent/runs` — list/create/get/
cancel/retry/explain, plus a live `@Sse()` progress stream) and
`KnowledgeBaseReferencesController` (`/knowledge-base/references` —
list/search/get/upsert/delete/reindex), both newly reachable by a human
user or the frontend for the first time — previously only an internal
Workflow Automation step could reach the orchestrator directly.

**Frontend — Agent Copilot UI** — a new `/agent` section (start a run,
browse recent runs, a live activity stream, a collapsible task tree, and a
tabbed Explainability view) and `/knowledge-base` (browse/search/reindex
the reference catalog), deliberately separate from Module 5's existing `/ai`
chat page.

**AI Chat / Memory / Voice / Automation enhancements** — branching,
bookmarks, and a prompt library added to Module 5's existing chat domain;
two new `AiMemorySourceType` values (`ORCHESTRATION_RUN`,
`KNOWLEDGE_BASE_REFERENCE`) so orchestration runs and the Knowledge Base
both participate in the existing RAG store; a new `ai_agent_run` Workflow
Automation Engine (Module 10) step kind.

## Bugs found and fixed

- **`ai-provider-registry.service.spec.ts` was stale and would not have
  compiled.** Discovered mid-testing-pass: this pre-existing spec file (from
  before Module 11) called `resolveProvider`/`resolveEmbeddingProvider`/
  `listStatuses` synchronously and constructed the service with a
  pre-privacy-controls constructor signature, both of which changed under
  task #234. Rewritten to match the current async, privacy-mode-aware
  implementation, with new coverage for every `CLOUD`/`LOCAL`/`HYBRID`
  branch.
- **A tuple-inference bug on the new Knowledge Base frontend page.**
  `new Map(results.map((r) => [r.entry.id, r.score]))` inferred
  `(string | number)[]` rather than a `[string, number]` tuple under this
  project's `strict` TypeScript config, which would have failed `tsc`.
  Caught during manual verification (see Known limitations) and fixed with
  an explicit tuple return-type annotation on the `.map()` callback.
- **Directory-listing (`Glob`) unreliability, worked around, not silently
  trusted.** An initial `Glob` search for existing `apps/api` spec files
  returned zero results; a later content search (`Grep` for
  `from '@jest/globals'`) found 100+ existing spec files across the
  project, including a stale Module-5-era `ai-provider-registry.service.spec.ts`
  (the bug above) that would have gone unnoticed had the incorrect `Glob`
  result been trusted. Every subsequent file-discovery step in this module
  used content search instead.

## Known limitations

- **Privacy Mode restricts provider choice, not execution location.** A
  `LOCAL`-mode workspace is restricted to `LOCAL_AI_PROVIDER_NAMES`
  (Ollama) reachable from this server process — it does not route execution
  to the user's own Desktop Agent (ADR 0007's full local-first definition).
  This gap is disclosed in the Privacy Mode service's own doc comment and in
  ADR 0011 §6, not silently narrowed.
- **`apps/web`'s TypeScript/lint changes were not verified by an executed
  `tsc`/`eslint` run in this session**, unlike `apps/api`'s (which did
  complete — see Testing below). Verified instead by direct manual
  cross-reference against the real shared DTOs and component/hook
  signatures; this process caught and fixed one real type error (above).
- **Full end-to-end orchestration-run execution** (a live model driving all
  twelve agents through a real task graph to completion) has no dedicated
  automated test in this pass — the Orchestrator's pure/independently
  testable logic (merge, retry, cancel, the `getRun`/`toTaskDto` paths) is
  covered; the live multi-agent execution loop is not.
- **The narrower task #228-#232 enhancements** (autonomous recon/vuln
  analysis, incremental report writing, chat branching/bookmarks, voice
  copilot, workflow automation integration) do not have dedicated new test
  files in this pass.
- Same disclosed migration-history gap as every module since 6 (ADR 0010
  §14): this module's schema changes were authored directly in
  `schema.prisma` plus a hand-written migration file, not via
  `prisma migrate dev` against a live database.

## Testing

New Jest spec files added to `apps/api` (the `agent` module had zero spec
files before this pass):

- `agent-authorization.util.spec.ts`
- `knowledge-base-reference.service.spec.ts`
- `agent-explainability.service.spec.ts`
- `agent-orchestrator.service.spec.ts`
- `prompt-driven-agent.base.spec.ts`
- `ai-privacy-mode.service.spec.ts` (new)
- `ai-provider-registry.service.spec.ts` (rewritten — see Bugs found above)

**Verification status**: `packages/shared`'s `tsc --noEmit` was re-run clean
after every shared-type change. `apps/api`'s full project-wide
`tsc --noEmit` and a scoped `eslint` pass both completed successfully this
session (zero errors) via a detached-background-process technique that
works around this sandbox's foreground command timeout — a genuine
improvement over every prior module's sandbox constraint, where this had
never previously completed. The identical technique did not reproduce for
`apps/web` or for Jest later in the same session (background processes were
observed not to survive between tool calls on a second attempt, and even a
maximally-scoped foreground run exceeded the timeout on I/O wait, not
compute) — both are disclosed as manual-review-verified rather than
tool-verified. See `docs/modules/11-ai-security-copilot-multi-agent-system.md`'s
Verification section for the full account.

**Before merging, run from the repo root:**
`pnpm build && pnpm lint && pnpm check-types && pnpm test`
