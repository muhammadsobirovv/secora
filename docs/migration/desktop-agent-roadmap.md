# Desktop Agent Roadmap

Companion to `docs/migration/local-first-architecture-migration.md` (the
audit) and `docs/adr/0007-local-first-desktop-agent-architecture.md` (the
decision record). This is the build plan for the Desktop Agent and the
corresponding backend/web changes, phased so the product stays working at
every step. No implementation has started yet — this is the plan the
architecture-refactor directive asked for.

## Stack

- **Framework**: Tauri (Rust core + OS webview). Electron only if a
  Phase 2 spike finds a hard blocker with no Rust/Tauri equivalent.
- **Targets**: Windows, Linux, macOS installers, code-signed, with
  auto-update.
- **Local storage**: SQLite (job history, config, evidence index) +
  filesystem (evidence bytes, tool binaries) + SQLite-vector-extension or
  LanceDB (RAG embeddings).
- **IPC with the web app**: a localhost HTTP/WebSocket server the Agent
  exposes (e.g. `127.0.0.1:<port>`), so `apps/web` can detect and talk to
  a running Agent the same way it already talks to the backend API — one
  more base URL, not a new transport.
- **IPC with the backend**: the Agent authenticates as the signed-in user
  (reuses existing JWT/session auth) and calls the same
  `packages/shared` endpoint contracts the web app already uses for
  job/result/metadata writes.

## Phase 1 — BYOK foundation (backend + web only, no Agent yet)

Goal: stop using the operator's AI keys immediately, without waiting on
the Agent.

- Add client-side (browser) encrypted local storage for user-supplied AI
  provider credentials (OpenAI/Anthropic/Gemini/OpenRouter/Ollama at
  minimum; LM Studio/DeepSeek/Mistral/Groq/Azure OpenAI as the same
  abstraction is extended).
- Add a provider-selection UI in `apps/web`'s AI settings.
- Change the AI chat/copilot call path to go browser → provider directly
  for cloud providers (no backend involvement in the inference call
  itself), and browser → `localhost:11434` for Ollama.
- Backend's `ai-provider-registry.service.ts` server-side execution path
  is kept only as an explicit, clearly-labeled fallback for deployments
  that choose to self-host shared keys (e.g. an internal team tool) —
  never the default.
- Ship a "no key configured, and Ollama isn't reachable" state that
  disables AI features with a clear message instead of erroring.

## Phase 2 — Desktop Agent MVP: Recon

Goal: prove the Agent shape end-to-end on the single most self-contained
surface.

- Scaffold the Tauri project (new `apps/desktop-agent` or a sibling repo —
  decide at spike time based on how much `packages/shared` reuse is
  practical from Rust vs. keeping a thin Rust shell around a bundled
  Node/TS sidecar process that reuses the existing tool-runner TS code
  almost unchanged).
- Technical spike: can the existing `modules/recon/tool-runners/adapters/*`
  TypeScript be reused as-is inside a Tauri sidecar process, or does it
  need a Rust rewrite? Reuse is strongly preferred — these adapters are
  already tested and correct; only their *host process* changes.
- Move all 14 Recon tool-runner adapters + `recon-job-execution.service.ts`'s
  tool-invocation responsibility into the Agent.
- Agent submits normalized `ReconResult` JSON to the existing backend
  endpoint contract — no backend API shape change.
- Backend's `ReconJobPollerService` changes from "trigger execution" to
  "detect jobs the Agent hasn't picked up" (used for UI status/timeout
  handling, not execution).
- Web app detects Agent presence (poll `localhost` health endpoint) and
  routes new Recon jobs to it when present; falls back to today's
  backend-executes-it behavior when absent, so nothing breaks for users
  who haven't installed the Agent yet.

## Phase 3 — Vuln scanning parity

- Move the 5 existing scanner-runner adapters (Nuclei/ffuf/dirsearch/
  feroxbuster/Nikto) using the Phase 2 pattern.
- Add the previously-unbuilt Dalfox, SQLMap, and XSStrike adapters
  directly in the Agent (no server-side version to migrate).
- Same fallback/detection behavior as Phase 2.

## Phase 4 — Local AI, RAG, and voice (largest phase)

- Agent hosts/manages local providers: bundled or user-pointed Ollama
  and LM Studio process lifecycle (start/stop/model pull status).
- Agent implements local RAG: SQLite-vector or LanceDB store, chunking +
  embedding pipeline reusing `AiMemoryService`'s existing chunking logic
  (ported, not server-called), indexing findings/notes/recon results as
  they're created — entirely on-device, opt-in per workspace.
- Agent implements voice: Whisper.cpp (STT) and Piper (TTS) as installed/
  bundled local models; Web Speech API remains the browser-only primary
  path when the Agent isn't running.
- Existing cloud speech adapters (Azure/ElevenLabs/Google/OpenAI) are
  kept and reclassified as optional, user-keyed providers alongside the
  local ones, selectable in the same settings UI as Phase 1's AI provider
  picker.
- Chat feature set (Streaming/Markdown/Mermaid/code-highlighting/
  Artifacts/Copy/Download/Voice-read/Stop/Retry/Continue/History/
  Pinned/Bookmarks/Search/Export with multi-format code export) is a web
  app UI effort layered on top of whichever provider path (browser-direct
  or Agent-mediated) is active — not gated on the Agent existing, since
  streaming/markdown/etc. work the same regardless of provider location.

## Phase 5 — Local report generation + tiered sync

- Lift `bug-report-template-renderer.ts`'s five templates into a shared
  renderer usable by `apps/web` directly (pure function, already only
  depends on data the client already has via existing GET endpoints) for
  Markdown/HTML; add PDF (e.g. via a headless-render-to-PDF approach in
  the Agent, or a browser-side PDF library for the no-Agent path) and
  DOCX generation.
- Build the Off / Metadata-Only (default) / Everything sync-tier setting
  and wire it into the Module 2 evidence-storage change from the audit:
  Metadata-Only syncs `Evidence` records without bytes; Everything also
  syncs bytes to whichever backend the user has selected (Local Disk is
  already the default via the Agent's own filesystem; Google Drive/
  Dropbox/OneDrive/S3-compatible/Cloudflare R2 are additive connectors
  behind the same `StorageService` interface the backend already defines).

## Cross-cutting, throughout all phases

- **Never break `apps/web`'s existing pages.** Every phase's backend
  contract change (if any) must be additive/backward-compatible; UI
  routes to the Agent when present, falls back otherwise.
- **Offline mode** is validated at the end of each phase for the
  capability that phase moved: Recon (Phase 2), Scanning (Phase 3),
  AI/voice/search (Phase 4), Reports (Phase 5) should each work with the
  backend unreachable once their phase lands.
- **Freemium gating** is only ever applied to Cloud Sync/Team
  Collaboration/Cloud Backup/Advanced Analytics/Priority Queue/
  Organization/Enterprise features — never to anything the Agent does
  locally. This is a policy check to make at each phase's PR review, not
  a separate implementation task.
- **Distribution**: web continues deploying to Cloudflare Pages; backend
  to a small VPS (its resource requirements shrink over the course of
  this migration rather than grow); Desktop Agent installers are a new
  release pipeline (per-OS build + signing + auto-update feed), scoped as
  its own infrastructure task once Phase 2 has a working artifact to
  distribute.

## Explicitly not started

No Tauri project has been scaffolded, no BYOK storage has been
implemented, and no existing tool-runner/scanner-runner/AI code has been
modified or deleted. This roadmap is the plan; execution begins only
after this document, the audit, and ADR 0007 are reviewed.
