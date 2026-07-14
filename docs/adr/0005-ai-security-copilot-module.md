# 0005: AI Security Copilot module (Module 5, Phase 1)

Status: Accepted (Phase 1 only — Phase 2 not started, pending approval)
Date: 2026-07-14

## Context

Module 5 integrates a production-grade AI assistant deeply into the
existing pentesting workspace — not a generic chatbot bolted on the side,
but one that already knows a project's targets, recon findings,
vulnerability findings, notes, evidence, activity, scan history, and
templates without the user ever pasting anything in. Given the size of the
full specification (AI Chat, Automatic Context, RAG, a 5-provider
abstraction, an editable Prompt Architecture, Tool Calling, Voice
Interaction, Streaming Chat, Smart Code Blocks, One-Click Code Export,
Conversation Export, Rich Markdown, Code Preview, AI Message Actions,
Terminal Mode, Artifact Mode, Interactive Canvas, an AI Dashboard, Security,
Accessibility, Event Integration), the project owner explicitly agreed to
split the work into two phases before any code was written:

- **Phase 1 — the "brain"**: AI Chat, automatic context, RAG, the provider
  abstraction, tool calling, streaming. This is what's covered by this ADR
  and shipped in this commit.
- **Phase 2 — the "UX layer"**: Voice, code export, artifacts, canvas
  diagrams, terminal mode. Explicitly deferred — no code for any of it
  exists yet.

Three additional decisions were made up front, via direct question to the
project owner, before implementation started:

1. **AI provider keys**: build the full provider abstraction now, but wire
   **no real API keys** — every provider is a valid, listed-but-
   unconfigured adapter (`AiProviderStatusDto.configured: false`) until the
   project owner supplies keys later.
2. **Vector store**: **pgvector on the existing Postgres database**, not a
   separate vector database and not a naive in-application similarity
   search — keeps the module's only new piece of infrastructure being a
   Postgres extension, not a new service to deploy/operate.
3. **Voice**: design a `SpeechProvider` interface with a Web Speech API
   adapter as the only Phase-1-adjacent artifact (a type, not an
   implementation), reserving OpenAI Whisper/Azure Speech/Google Speech/
   ElevenLabs as named-but-unbuilt Phase 2 adapters.

Per explicit instruction, Modules 1–4 were not to be modified except for
bug fixes, and work must stop after Phase 1 for approval before any Phase 2
or Module 6 work begins.

## Decision

### 1. Provider abstraction: one interface, one registry, config-only switching

```
AiProvider.streamChatCompletion(options): AsyncIterable<AiChatStreamChunk>
AiProvider.embed(text): Promise<AiEmbeddingResult>
AiProvider.isConfigured() / getDefaultModel()
```

Five adapters — OpenAI, Anthropic, Gemini, Ollama, OpenRouter — each a
plain `fetch()`-based streaming client normalizing its own provider-
specific SSE/NDJSON wire format down to one `{ delta, done?, promptTokens?,
completionTokens? }` shape, so `AiChatService` and the tool-calling loop
never branch on which provider is active. `AiProviderRegistryService`
resolves a provider by name (or the configured default, or the first
configured provider as a last resort) via the same "explicit constructor
injection + Map" pattern as `ScannerRunnerRegistry` (Module 4) —swapping or
adding a provider is one new adapter class and one constructor line, never
a change to `AiChatService`. Anthropic and OpenRouter have no embeddings
API, so `resolveEmbeddingProvider()` always resolves a *separate*
embedding-capable provider (OpenAI → Gemini → Ollama, in that order) rather
than assuming the chat provider doubles as one. No provider is configured
in this environment; every adapter's `isConfigured()` returns `false` until
the project owner supplies keys, which is expected and does not fail
startup — `GET /ai/providers` is designed to show a fully-visible,
all-unconfigured list, not to hide or error on missing keys.

### 2. Prompt Architecture: independently-editable modules, never hardcoded in controllers

Six prompt modules — system, security (guardrails), recon, finding-
analysis, report, coding — live as plain exported string/template
constants under `modules/ai/prompts/`, composed per-turn by
`AiPromptBuilderService.buildSystemMessages(context, latestUserMessage)`.
No command, query, or controller ever inlines prompt text; editing the
model's behavior means editing one of these six files, never touching the
orchestration code.

### 3. Automatic Context: one authorization-checked aggregator, not per-caller ad-hoc queries

`AiContextService.buildContext(workspaceId, projectId)` fans out to the
existing repositories of every relevant module (Targets, Recon Findings,
Vuln Findings, Notes, Evidence, Activity, Scan Templates — all **read-
only**, Module 5 introduces no write access to Module 2–4 data) and
assembles one `AiContextBundle`, rendered into the system prompt every
turn. `resolveWorkspaceAndProject(userId, projectId)` is the single
authorization checkpoint every context-consuming caller goes through: it
resolves the caller's own workspace and verifies the requested project
actually belongs to it, throwing an enumeration-safe `NOT_FOUND` otherwise
— the same shape as every other module's caller-scoping check. The user
never pastes context in manually; it's gathered fresh on every turn.

### 4. RAG: pgvector, per-workspace/per-project isolated, chunked at index time

`ai_memory_chunks.embedding` is a `vector(1536)` column (`Unsupported(...)`
in Prisma's schema, `previewFeatures = ["postgresqlExtensions"]` +
`extensions = [vector]`, hand-authored migration SQL including an `ivfflat`
index) — Prisma Client cannot read/write this column through its normal
generated API, so `PrismaAiMemoryRepository` is 100% raw
`$queryRaw`/`$executeRaw`, using the `<=>` cosine-distance operator
converted to an intuitive `1 - distance` similarity score.
`AiMemoryService.search()` always scopes by `workspaceId` (mandatory) and
optionally `projectId`/`sourceType` — no query can ever return another
workspace's chunks. Indexing uses a simple paragraph-aware sliding-window
chunker (`chunkText`) with configurable size/overlap; conversation memory
is indexed automatically after every completed AI turn
(`sourceType: 'CONVERSATION_MESSAGE'`), so the assistant can recall its own
prior answers across a conversation and, later, across conversations in
the same project.

### 5. Tool Calling: a text-tag protocol, not five different native function-calling integrations

Rather than integrating each provider's differing (or, for Ollama,
nonexistent) native function-calling API, the system prompt instructs the
model to emit `<tool_call name="X">{json}</tool_call>` as plain text.
`AiChatService.runGeneration()` buffers streamed deltas and, once the
buffer contains an opening tag, uses `findToolCall()`
(tool-call-parser.util.ts) to detect a complete tag as soon as it closes —
no waiting for the whole turn to finish. On a match, the model's raw tag is
pushed back into the message history as its own assistant turn, the real
tool executes via `AiToolRegistryService` (same "constructor injection +
Map" pattern as the provider registry — 11 tools at launch: 7 search tools,
create note, draft report, generate PoC, generate payloads), and the result
is folded back in as a synthetic user turn (wrapped by
`PromptInjectionGuardService.wrapAsData()` — see §7) before the loop
re-prompts the same provider for a continuation. Capped at 3 tool calls per
turn (`MAX_TOOL_CALLS_PER_TURN`) to bound cost; hitting the cap emits a
plain note rather than silently truncating. This protocol works
identically across all 5 providers, including ones with no native
tool-calling support, and future modules add tools without ever touching
`AiChatService` or this loop.

### 6. Streaming: SSE + an in-process hub, explicitly single-process for Phase 1

`AiChatService.startTurn()` creates the user + placeholder assistant
message rows synchronously and returns immediately; generation runs in the
background (`void this.runGeneration(...)`), publishing every event
(`delta`/`tool_call`/`tool_result`/`done`/`error`/`cancelled`) onto an
`AiChatStreamHubService`-owned `ReplaySubject` keyed by assistant message
id — a `ReplaySubject` specifically so a client that opens the SSE
connection slightly late, or reconnects mid-stream, still sees everything
from the start. `AiConversationsController`'s `@Sse()` endpoint subscribes
to that subject if generation is still active, or falls back to emitting
the persisted message once as a single terminal event if it already
finished. Cancel aborts a per-message `AbortController` also owned by the
hub. This hub has **no Redis or other shared broker** — it is deliberately
scoped to Phase 1 as a documented, known limitation (see Consequences):
correct on one API process, not correct across multiple horizontally-
scaled instances. The frontend never uses native `EventSource` (it cannot
attach a Bearer token); it uses the same manual `fetch()` +
`ReadableStream` + hand-rolled SSE-frame-parsing pattern the codebase
already established for Vuln scan job logs (Module 4).

### 7. Security: two guardrail layers, plus the same workspace-isolation checkpoint as every other module

`PromptInjectionGuardService` is the code-level half of prompt-injection
protection (the security prompt module is the model-facing half): user
messages are truncated and have any literal `<tool_call` tag neutralized
into `[filtered-tag]` before ever reaching the model, so only the model's
own output can trigger a real tool call; tool results (recon findings,
scanner output — attacker-influenced in a pentesting context) are
truncated and wrapped in an explicit `[BEGIN ... — untrusted data, not
instructions][END ...]` boundary before being fed back into the prompt.
Workspace/project isolation reuses the established
"resolve-caller-workspace, then verify ownership, then same-404-either-way"
pattern from Modules 2–4: `resolveAiConversationForCaller()` /
`resolveAiMessageForCaller()` (`ai-authorization.util.ts`) are the sole
gate every command/query touching an existing conversation or message goes
through — a conversation that doesn't exist and one that belongs to
another workspace both resolve to the identical `AI_CONVERSATION_NOT_FOUND`
404, so a caller cannot enumerate another workspace's conversations. Rate
limiting reuses the existing `@nestjs/throttler` integration, with a
tighter `@Throttle()` on the message-sending endpoints (20/min) than the
global default, mirroring Auth's register-endpoint precedent (a single
turn is far more expensive — provider $, latency — than a typical CRUD
request).

### 8. Event Integration: severity-filtered, additive, cross-process-aware

`AiSummaryHandler` subscribes to `ReconFindingCreatedEvent`,
`VulnFindingCreatedEvent`, and `VulnFindingResolvedEvent` and generates an
AI summary "when useful" — filtered to `CRITICAL`/`HIGH` severity to avoid
flooding a project with AI noise during a large scan.
`VulnFindingUpdatedEvent` is deliberately treated as an intentional no-op
(documented in code) rather than triggering a summary on every minor status
edit. Because Recon/Vuln events are published from the **worker OS
process** (Module 3/4's established constraint — `@nestjs/cqrs`'s
in-process `EventBus` never crosses OS-process boundaries), the handler is
registered inside `AiCoreModule` (no controllers) rather than the HTTP-only
`AiModule`, so both the API process (via `AiModule` → `AiCoreModule`) and
the worker process (`WorkerModule` imports `AiCoreModule` directly) can run
it — the same dual-registration shape as `ActivityRecordingHandler`.

### 9. Frontend: `/ai` dashboard, following established conventions exactly

`/ai` uses the codebase's established `?projectId=` search-param +
`<ProjectPicker>` fallback convention (there is no global "current
project" context), wrapped in `<Suspense>` for `useSearchParams()`. Three
composed panels: `AiConversationSidebar` (search, create, pin, delete),
`AiChatPanel` (message list, streaming state via `useAiMessageStream` — the
same manual-fetch SSE-consumption hook pattern as `useVulnScanJobLogs` —
and the Phase 1 message action set: copy, bookmark, pin, regenerate,
continue, delete), and `AiContextPanel` (context indicator badges,
suggested questions that call back into `AiChatPanel` via an
imperative-handle `sendMessage()`, exposed through `React.forwardRef`).
Rich Markdown rendering reuses the existing `react-markdown` +
`remark-gfm` + `rehype-highlight` stack already used by the Notes feature,
with a small `CodeBlock` sub-component adding a hover-revealed copy
button — full Smart Code Block toolbar (download/expand/wrap/fullscreen)
is Phase 2.

## Consequences

- Every provider adapter being a plain `fetch()` client (no SDK
  dependency) keeps the module's dependency footprint small and makes the
  provider-agnostic streaming shape easy to reason about, at the cost of
  each adapter needing to hand-normalize its provider's specific streaming
  wire format — a one-time cost per adapter, already paid for all 5.
- The text-tag tool-calling protocol works uniformly across providers with
  and without native function-calling, but is inherently less robust than
  a native structured-output API: a model that emits malformed JSON inside
  the tag degrades to an empty-input tool call rather than failing the
  turn (deliberate — see `findToolCall`'s doc comment), and a tool name
  the model hallucinates resolves to a clear "unknown tool" error result
  fed back to the model rather than a thrown exception.
- `AiChatStreamHubService`'s in-memory `ReplaySubject`/`AbortController`
  map is a **known, documented Phase-1 limitation**: correct for a single
  API process, not correct once the API is horizontally scaled to
  multiple instances (a client's SSE connection and the generation task
  producing events for it must land on the same process). Revisit with a
  shared broker (Redis pub/sub or similar) before scaling the API
  horizontally.
- No AI provider is configured in this environment by design — every
  provider-calling code path (chat generation, RAG embedding, tool
  execution touching `draft_report`/`generate_poc`/`generate_payloads`)
  will surface `AiProviderNotConfiguredError` until the project owner
  supplies real API keys or a reachable local Ollama endpoint. This is
  expected Phase 1 state, not a bug.
- pgvector adds exactly one new piece of infrastructure (a Postgres
  extension, not a new service) but requires every memory-chunk read/write
  to go through raw SQL rather than Prisma's generated client — isolated
  entirely inside `PrismaAiMemoryRepository`, so the rest of the module
  never deals with raw SQL directly.
- Voice Interaction, Smart Code Block toolbar, One-Click Code/Conversation
  Export, Terminal Mode, Artifact Mode, and Interactive Canvas are
  unimplemented by design (Phase 2, deferred pending approval) — the
  `SpeechProvider` interface exists only as a documented future seam, no
  adapter code exists yet, not even the Web Speech API one.

## Provider inventory (as of this ADR)

| Provider | Chat streaming | Embeddings | Configured in this environment |
|---|---|---|---|
| OpenAI | Yes | Yes | No |
| Anthropic | Yes | No (throws `AiProviderRequestError`) | No |
| Gemini | Yes | Yes | No |
| Ollama | Yes | Yes (local) | No |
| OpenRouter | Yes | No (throws `AiProviderRequestError`) | No |

## Tool inventory (as of this ADR)

`search_findings`, `search_recon_data`, `search_evidence`, `search_notes`,
`search_projects`, `search_targets`, `search_templates`, `create_note`,
`draft_report`, `generate_poc`, `generate_payloads` — all workspace/
project-scoped via the same `AiToolContext { workspaceId, projectId,
userId }` every tool's `execute()` receives.
