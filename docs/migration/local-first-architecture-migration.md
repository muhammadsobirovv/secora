# Local-First Architecture Migration — Audit & Plan

Status: **Audit complete. No code migrated yet** — this document is the required
first deliverable before any Desktop Agent code is written, per the
architecture-refactor directive. Modules 1-6 remain on the current
server-executes-everything architecture until each is migrated per the
phased plan below.

Companion documents: `docs/adr/0007-local-first-desktop-agent-architecture.md`
(the decision record) and `docs/migration/desktop-agent-roadmap.md` (the
Desktop Agent build plan).

## 1. Core principle being adopted

The backend becomes a thin, metadata-only coordination layer responsible
only for: Authentication, User accounts, Workspace/Project/Target/Note
metadata, Findings metadata, Activity timeline, Team collaboration, API
keys (Secora's own), Preferences, Reports metadata, Sync, Notifications,
RBAC, Audit logs. Everything computationally expensive — tool execution,
AI inference, file storage, voice, RAG, report rendering — moves to a new
**Desktop Agent** running on the user's machine. The web app remains a
thin client for account/workspace management and (post-migration) for
talking to a locally-running Desktop Agent over localhost.

## 2. Module-by-module audit

### Module 1 — Auth & User Accounts

No change required. Login, registration, JWT/refresh, MFA, password reset
are inherently server-side concerns (multi-device session state) and
involve no heavy computation. **Stays backend, as-is.**

### Module 2 — Workspace Foundation

Workspaces, Projects, Targets, Notes, Tags, Activity, Audit, RBAC
scaffolding, User Preferences, Search are all lightweight metadata CRUD.
**Stays backend, as-is** — these are exactly the categories the new
principle explicitly keeps server-side.

One finding that does need to change:

- **Evidence/Attachments storage is currently server-side.**
  `apps/api/src/common/providers/storage/local-disk-storage.service.ts`
  writes uploaded files (screenshots, PoC videos, HTTP req/resp logs) to
  disk on the API server itself, and `StorageService`/`STORAGE_SERVICE` is
  the only storage abstraction that exists — there is no client-local
  storage path today. This directly conflicts with "Evidence/screenshots/
  videos/logs/HTTP req-resp/payloads stay local by default, sync only if
  the user opts in." **Action required**: the Desktop Agent becomes the
  default evidence store; the backend's `StorageService` interface is
  kept (it's already a clean seam) but its default implementation target
  moves to "the Desktop Agent's local filesystem, addressed by the sync
  layer," with `LocalDiskStorageService` demoted to an opt-in "Everything"
  sync-tier backend alongside Google Drive/Dropbox/OneDrive/S3/R2.

### Module 3 — Recon (heaviest compute item, non-AI)

`apps/api/src/modules/recon/tool-runners/adapters/` contains 14 tool
runners that shell out to real binaries server-side: Nmap, Subfinder,
HTTPX, DNSx, Naabu, WhatWeb, Assetfinder, Gowitness, Amass, Katana, Gau,
Waybackurls, Whois, ASN-lookup. These are driven by
`recon-job-execution.service.ts` and polled by
`recon-job-poller.service.ts`, both running in the separate `worker.main.ts`
OS process.

**Action required — full move to Desktop Agent**: all 14 tool-runner
adapters, the execution service, and the poller's *tool-invocation*
responsibility move client-side. The Desktop Agent runs the actual
binaries (bundled or user-installed) against user-supplied targets, and
submits results to the backend as pre-normalized JSON. The **normalizer**
(the logic that turns each tool's raw output into Secora's canonical
`ReconResult` shape) is preserved but relocates conceptually to the
boundary: it ships inside the Desktop Agent (so raw tool output never
needs to leave the user's machine) and its schema contract lives in
`packages/shared` so both the Desktop Agent and backend agree on the
normalized-JSON shape without duplicating the mapping logic in two
languages/runtimes. The backend keeps: `ReconJob` (now represents
"a job the Desktop Agent should run or already ran," not "a job the
backend's worker executes"), `ReconResult` storage, history, Activity
events, and dashboard statistics. The `ReconJobPollerService` survives as
"poll for jobs the Desktop Agent hasn't picked up yet" bookkeeping rather
than as a tool-execution trigger.

### Module 4 — Vulnerability Scanning

`apps/api/src/modules/vuln/scanner-runners/adapters/` contains 5 scanner
runners: Nuclei, ffuf, dirsearch, feroxbuster, Nikto — driven by
`vuln-scan-job-execution.service.ts` / `vuln-scan-job-poller.service.ts`,
same worker-process pattern as Module 3. Dalfox, SQLMap, and XSStrike
(named in the new spec as required future coverage) do not exist in the
codebase yet — they should be added directly as Desktop Agent scanner
adapters rather than being built server-side first and migrated later.

**Action required — same shape as Module 3**: scanner execution moves
to the Desktop Agent; the backend keeps `VulnScan`/`VulnFinding`
metadata, severity/CVSS, evidence *metadata* (the evidence bytes
themselves follow Module 2's storage change), Activity, History, and
Dashboard stats.

### Module 5 — AI Security Copilot (heaviest compute item, AI)

This is the largest and most consequential migration.

- **Provider execution is server-side today**, and — critically —
  **the API keys used are the deployer's, not the user's.**
  `ai-provider-registry.service.ts` resolves each provider adapter
  (OpenAI/Anthropic/Gemini/Ollama/OpenRouter — 5 of the 10 providers the
  new spec requires; LM Studio, DeepSeek, Mistral, Groq, and Azure OpenAI
  are missing entirely) via `ConfigService<EnvConfig>`, i.e. server
  environment variables such as `AI_OPENAI_API_KEY`. Every workspace on
  the deployment shares whichever keys the operator configured. This is
  the single clearest violation of "must never require the product
  owner's API keys; every user brings their own provider" in the entire
  codebase.
- **RAG is server-side Postgres/pgvector.** `prisma/schema.prisma` uses
  `extensions = [vector]` and an `AiMemoryChunk.embedding
  Unsupported("vector(1536)")` column; `AiMemoryService` chunks, embeds,
  and stores workspace content (findings, notes, recon data) in this
  table, then does cosine-similarity search server-side. This conflicts
  with "RAG: local only (SQLite+embeddings or LanceDB), no mandatory
  cloud vector DB, never upload private data" — today, private
  finding/note content is embedded and stored in the backend's Postgres
  instance unconditionally, with no user opt-out.
- **Voice is entirely cloud-provider-based server-side.**
  `modules/ai/speech/adapters/` has Azure Speech, ElevenLabs, Google
  Speech, and OpenAI Speech adapters, plus one `web-speech.provider.ts`
  (which is really a passthrough contract for the browser's own Web
  Speech API, not a server call). There is no Whisper.cpp or Piper TTS
  path anywhere in the codebase. This conflicts with "Voice: local-first
  ... never require cloud TTS."
- **Tool-calling (`modules/ai/tools/`)** — `create-note`, `draft-report`,
  `generate-payloads`, `generate-poc`, and five `search-*` tools — is
  reasonable to keep as a *contract* (tool schemas, dispatch), but the
  underlying LLM call each tool triggers must go through the same
  client-side provider abstraction as chat.
- `api-keys` module (`modules/api-keys/`) is unrelated to this: it's
  Secora's own programmatic-API-key foundation (scopes, hashing,
  revoke), not a place where users store their OpenAI/Anthropic keys.
  **No BYOK credential storage exists in this codebase today.**

**Action required**: build a client-side AI provider abstraction
(Desktop Agent for Ollama/LM Studio process management + all cloud
providers; web app can also call cloud providers directly from the
browser for users without the Desktop Agent installed, since those are
plain HTTPS calls). User-supplied keys are stored locally (OS keychain
via the Desktop Agent, or browser-side encrypted storage for the web-only
path) and never transit through or get stored by the Secora backend.
RAG moves to a local vector store (SQLite+embeddings or LanceDB) inside
the Desktop Agent, indexing the same categories of content
(findings/notes/recon results) but entirely on-device. Voice moves to
Web Speech API (browser, primary) with Whisper.cpp (STT) and Piper (TTS)
as Desktop Agent fallbacks; the four existing cloud speech adapters
(Azure/ElevenLabs/Google/OpenAI) are **not deleted** — they become
optional, user-opt-in, user-keyed providers rather than the default path,
consistent with "never require cloud TTS" (optional cloud TTS is fine;
mandatory is not).

### Module 6 — Bug Bounty Workspace

- **Report Draft Assistant** and **Duplicate Detection's semantic
  scoring** both call into Module 5's AI/RAG seam
  (`AiMemoryService`/provider registry) — they inherit Module 5's
  migration automatically once that seam moves client-side. Duplicate
  Detection's **lexical** scoring (`duplicate-lexical-score.util.ts`,
  Jaccard/exact-field matching) is cheap pure-function work and can stay
  server-side without conflicting with the new principle, or move
  client-side later purely for offline support — not urgent either way.
- **Bug Report template rendering** (`bug-report-template-renderer.ts`)
  produces Markdown/HTML server-side today; PDF "export" is a documented
  stopgap that just returns the HTML with `mimeType: text/html` for the
  client to convert. Per the new spec ("Reports (PDF/Markdown/HTML/DOCX)
  generate locally, only metadata syncs"), the actual rendering
  (Markdown/HTML/PDF/DOCX byte generation) should move to the web app or
  Desktop Agent; the backend keeps only the `BugReport` record's
  structured fields (title/summary/steps/impact/etc — the metadata that
  seeds the render) and the report's lifecycle metadata (status,
  submittedAt, platform, bounty amount). This is a natural fit: the
  five-template renderer is a pure function of data already returned to
  the client via the existing GET endpoints, so it can be lifted
  into `apps/web` (or a shared `packages/` renderer used by both web and
  the Desktop Agent) with no backend contract change.
- Payload Library's AI "explain this payload" call is a Module 5 AI call
  and migrates with it. Everything else in Module 6 (Programs, Scope
  Manager, Asset Inventory, Findings lifecycle, Calendar, Notifications,
  Bookmarks, Knowledge Base, Search) is metadata/CRUD and needs no change.

## 3. Summary table

| Module | Stays backend (metadata) | Moves to Desktop Agent / client |
|---|---|---|
| 1 Auth | Everything | — |
| 2 Workspace/Projects/Targets/Notes | Everything | Evidence file bytes (storage default) |
| 3 Recon | Job/Result metadata, history, activity, stats | All 14 tool runners, execution engine's tool invocation |
| 4 Vuln | Finding/severity/CVSS/evidence-metadata, activity, stats | All 5 (+future) scanner runners |
| 5 AI Copilot | Chat history metadata (if synced), tool schema contracts | Provider execution + BYOK keys, RAG/embeddings, voice STT/TTS |
| 6 Bug Bounty | Program/Scope/Finding/Report/Payload/KB metadata | Report rendering (PDF/MD/HTML/DOCX), AI draft/dup-detection (via M5) |

## 4. Migration strategy

**Strangler fig, not a rewrite.** The existing REST API contracts
(`packages/shared/src/*-endpoints.ts`) are preserved wherever the backend
keeps the underlying responsibility (all of Modules 1-2, and the metadata
slices of 3/4/5/6). Nothing in `apps/web`'s current pages breaks during
Phase 0-1 of the roadmap: the Desktop Agent is additive, and the backend
continues accepting job-result submissions in whatever shape it does
today until the Desktop Agent is ready to replace the worker-process
tool execution — at which point the *source* of `ReconResult`/
`VulnFinding` writes changes (Desktop Agent instead of the in-process
tool runner) but the write shape and downstream read APIs do not.

Concretely, phased as:

1. **Phase 0 (this document + ADR 0007 + roadmap)** — no code changes.
2. **Phase 1 — BYOK foundation**: add client-side credential storage and
   a provider-selection UI in `apps/web`; keep server-side execution as a
   fallback path gated behind "no Desktop Agent detected," so the product
   works end-to-end before the agent exists. This alone fixes the
   worst violation (deployer's keys) without waiting on the full agent.
3. **Phase 2 — Desktop Agent MVP**: Tauri shell, local job runner for
   Recon tool execution only (highest-value, most self-contained
   surface), talking to the existing backend over the existing
   `ReconJob`/`ReconResult` HTTP contract.
4. **Phase 3 — Vuln scanning parity** in the Desktop Agent, same pattern.
5. **Phase 4 — Local AI + RAG + voice** in the Desktop Agent (the biggest
   phase); web app falls back to direct-from-browser cloud-provider calls
   when the Desktop Agent isn't running, still never touching the backend
   for inference.
6. **Phase 5 — Local report generation** (Module 6 renderer lift) and the
   tiered sync model (Off/Metadata-Only/Everything) with pluggable cloud
   storage backends.

Full milestone/task breakdown is in `docs/migration/desktop-agent-roadmap.md`.

## 5. Explicitly out of scope for this pass

Per the user's own "STOP... audit... before writing ANY code" framing,
this pass does not: delete or rewrite any tool-runner/scanner-runner
code, scaffold the Tauri project, implement BYOK storage, or touch
Module 5's provider registry. Those are Phase 1+ work, to be started only
after this audit and the accompanying ADR/roadmap are reviewed.
