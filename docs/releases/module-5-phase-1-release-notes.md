# Module 5 Phase 1 Release Notes — AI Security Copilot (the "brain")

Full decision record: `docs/adr/0005-ai-security-copilot-module.md`.

Per the agreed phasing, this release covers **Phase 1 only** — AI Chat,
automatic context, RAG, the provider abstraction, tool calling, and
streaming. **Phase 2** (Voice, code export, artifacts, canvas diagrams,
terminal mode) is explicitly out of scope for this release; work stops here
pending approval to continue.

## Features added

**Backend** — the AI Security Copilot engine:

- **AI Chat**: workspace/project-aware, persistent conversations
  (`AiConversation` → `AiMessage`), streamed token-by-token over SSE, with
  Cancel, Regenerate, and Continue all wired through
  `AiChatStreamHubService`.
- **Automatic Context**: `AiContextService` gathers targets, recon
  findings, vulnerability findings, notes, evidence, activity, and scan
  templates for the active project on every turn — the user never pastes
  data in manually.
- **RAG**: pgvector-backed semantic memory (`ai_memory_chunks`,
  `vector(1536)`, raw-SQL cosine-distance search), isolated per workspace
  and optionally per project; conversation turns are indexed automatically
  after completion so the assistant can recall its own prior answers.
- **AI Provider abstraction**: 5 adapters — OpenAI, Anthropic, Gemini,
  Ollama, OpenRouter — behind one `AiProvider` interface and an
  `AiProviderRegistryService` registry (same pattern as Module 4's
  `ScannerRunnerRegistry`). **No API keys are configured** in this
  environment by explicit agreement — every provider is a valid, visibly
  "not configured" entry in `GET /ai/providers`, wired for later.
- **Prompt Architecture**: 6 independently-editable prompt modules
  (system, security, recon, finding-analysis, report, coding) — never
  hardcoded in controllers or services.
- **AI Tool Calling**: a provider-agnostic `<tool_call>` text-tag protocol
  (works even on providers with no native function-calling, e.g. Ollama).
  11 tools at launch: search findings/recon data/evidence/notes/projects/
  targets/templates, create note, draft report, generate PoC, generate
  payloads — registered via `AiToolRegistryService`, extensible by future
  modules without touching the chat engine.
- **Streaming**: SSE token deltas, tool-call/tool-result events, mid-stream
  cancellation via `AbortController`, capped at 3 tool calls per turn.
- **Security**: prompt-injection guardrails (`PromptInjectionGuardService`
  neutralizes literal `<tool_call>` tags in user input, truncates and
  data-boundary-wraps tool output), the same enumeration-safe workspace-
  isolation checkpoint every other module uses
  (`resolveAiConversationForCaller`/`resolveAiMessageForCaller`), and a
  tighter rate limit on message-sending endpoints (20/min).
- **Event Integration**: `AiSummaryHandler` subscribes to
  `ReconFindingCreatedEvent`/`VulnFindingCreatedEvent`/
  `VulnFindingResolvedEvent`, filtered to Critical/High severity, running
  in both the API and worker processes (same dual-registration shape as
  `ActivityRecordingHandler`).
- REST API: conversations (CRUD, pin, archive), messages (send, regenerate,
  continue, cancel, bookmark, pin, delete), providers status, context
  summary + suggested questions, memory search — fully documented in
  Swagger (`@ApiTags('ai')`).

**Frontend** — `/ai` AI Dashboard:

- `?projectId=` + `<ProjectPicker>` fallback (matching every other
  project-scoped page's convention), wrapped in `<Suspense>`.
- `AiConversationSidebar` (search, create, pin, delete),
  `AiChatPanel` (streaming message list with the Phase 1 action set —
  copy, bookmark, pin, regenerate, continue, delete — driven by
  `useAiMessageStream`, the same manual `fetch()`+`ReadableStream` SSE
  pattern as Module 4's scan job logs), `AiContextPanel` (context
  indicator badges + suggested questions wired into the chat panel via an
  imperative handle).
- Rich Markdown rendering (tables, code blocks with a hover copy button,
  GFM) reusing the existing `react-markdown`/`remark-gfm`/
  `rehype-highlight` stack already used by Notes.

## Architectural improvements

- **Provider-agnostic tool calling via a text-tag protocol** is a new
  pattern for this codebase — avoids needing 5 different native
  function-calling integrations (one of which, Ollama, doesn't have one),
  at the cost of parsing model output rather than a structured API.
- **pgvector on the existing Postgres instance** proves the "no new
  infrastructure service" approach for vector search — one extension, one
  raw-SQL-isolated repository, no separate vector database to operate.
- **In-process SSE pub/sub hub** (`AiChatStreamHubService`) is a genuinely
  new pattern versus Module 3/4's polling-based live updates — true
  token-by-token push, at the documented cost of being single-process-only
  for now.
- **`AiCoreModule`/`AiModule` split** extends the Module 3/4
  core-module/HTTP-module pattern to a module whose event handler
  (`AiSummaryHandler`) must run in both the API and worker OS processes.

## Breaking changes

None. Every addition is additive: new enums, new tables (including the new
`vector` Postgres extension), a new module wired into the existing
`AppModule`/`WorkerModule`, one new frontend route (`/ai`, promoted from
`FUTURE_NAV` to `PRIMARY_NAV`). No Module 1–4 endpoint, contract, or schema
column changed.

## Known limitations

- **No AI provider is configured.** Every provider-calling code path
  (chat generation, RAG embedding, `draft_report`/`generate_poc`/
  `generate_payloads`) will throw `AiProviderNotConfiguredError` until real
  API keys (or a reachable local Ollama endpoint) are supplied — by
  explicit agreement with the project owner, this is expected Phase 1
  state, not a bug.
- **`AiChatStreamHubService` is single-process only** — no Redis or shared
  broker backs it yet. Correct for one API instance; would need a shared
  pub/sub layer before horizontally scaling the API process.
- **Phase 2 was unbuilt at the time of this release** — see
  `docs/releases/module-5-phase-2-release-notes.md`, shipped the same day
  once Phase 1 verification/commit/push completed and Phase 2 was
  approved: Voice Interaction, Smart Code Block toolbar, One-Click Code/
  Conversation Export, Terminal Mode, Artifact Mode, and Interactive
  Canvas are now all implemented.
- The tool-call text-tag protocol depends on the model reliably emitting
  well-formed tags — malformed JSON degrades to an empty-input tool call
  rather than failing the turn, and an unrecognized tool name resolves to
  an error result fed back to the model, but a model that never learns to
  emit the tag at all (unlikely with the system prompt's explicit
  instructions, but possible with a very small local Ollama model) simply
  never calls tools — there's no fallback native-function-calling path.
- Full `pnpm build`/`lint`/`check-types`/`test` verification for this
  module is run by the project owner outside this environment (the
  sandbox this work was authored in cannot fetch Prisma engine binaries,
  run the pgvector-dependent migration against a real Postgres instance,
  or reliably run a full Next.js typecheck) — see the ADR's Consequences
  section and the commit history for the verification pass.

## Recommended next step

Per explicit instruction, work stopped here pending approval — Phase 2
was subsequently approved and shipped the same day; see
`docs/releases/module-5-phase-2-release-notes.md`.
