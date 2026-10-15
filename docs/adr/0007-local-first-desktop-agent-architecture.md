# ADR 0007 — Local-first architecture and the Desktop Agent

Status: accepted, Module 7 (Desktop Agent) source-complete as of
2026-07-19 — see `docs/modules/07-desktop-agent.md`'s "Implementation
status" table and "Verification handoff" section (written without a
Rust/npm toolchain available; needs `cargo build`/`pnpm build` and manual
smoke-testing on a real machine before shipping).
Context: architecture-refactor directive covering Modules 1-6; audit at
`docs/migration/local-first-architecture-migration.md`; build plan at
`docs/migration/desktop-agent-roadmap.md`.

This records the decision to pivot Secora AI from "NestJS backend
executes everything" to "backend is a thin metadata/coordination layer;
a new Desktop Agent executes everything expensive." It supersedes no
prior ADR outright — Modules 1-6's *internal* patterns (CQRS, repository
interfaces, core/HTTP module split, domain events, soft delete, optimistic
locking) are unaffected and continue to apply to both the backend and the
Desktop Agent's own internal structure. What changes is *where* certain
responsibilities execute.

---

## Decision

1. **The backend never executes scanners, AI inference, or report
   rendering.** It stores metadata, coordinates jobs, and serves the
   Activity/Audit/RBAC/Notification/Sync surfaces that genuinely require
   a central multi-device authority.
2. **A new Desktop Agent is the execution environment for everything
   expensive**: Recon tool runners (Nmap, Subfinder, HTTPX, DNSx, Naabu,
   WhatWeb, Assetfinder, Gowitness, Amass, Katana, Gau, Waybackurls,
   Whois, ASN), Vuln scanner runners (Nuclei, ffuf, dirsearch,
   feroxbuster, Nikto, plus future Dalfox/SQLMap/XSStrike), AI provider
   calls (user's own keys, never the operator's), local RAG
   (SQLite+embeddings or LanceDB), voice (Whisper.cpp/Piper as fallbacks
   to the browser's Web Speech API), local file storage for evidence, and
   report generation (PDF/Markdown/HTML/DOCX).
3. **Tauri is the Desktop Agent's framework**, not Electron.
4. **Sync is opt-in and tiered**: Off / Metadata-Only (default) /
   Everything. Nothing about core functionality (recon, scanning,
   reports, local AI, voice, search) requires the backend or an internet
   connection.
5. **AI providers are entirely user-supplied**, spanning OpenAI,
   Anthropic, Gemini, OpenRouter, Ollama, LM Studio, DeepSeek, Mistral,
   Groq, and Azure OpenAI, with Ollama as the no-key default and a
   graceful (non-crashing) degraded mode if even Ollama is unavailable.
6. **Freemium boundary is cloud convenience, not local capability.** Free
   tier is unlimited for everything that runs locally; Premium unlocks
   only Cloud Sync, Team Collaboration, Cloud Backup, Advanced Analytics,
   Priority Queue, Organization Features, and Enterprise Integrations.

## Alternatives considered

### Keep server-side execution, add a job queue / worker pool for scale

Rejected. This scales the *existing* problem (server pays for every
user's compute, private target data transits and rests on
Secora-operated infrastructure, users cannot work offline, and the
product cannot ethically claim "your recon data never leaves your
machine") rather than solving it. It also directly contradicts the
explicit product requirement driving this refactor.

### Electron instead of Tauri

Considered and rejected as the primary choice, acceptable only as a
fallback. Tauri produces materially smaller installers and lower idle
memory/CPU footprint (matters here because the Desktop Agent runs
alongside actual scanner processes, which are themselves resource-
intensive), uses the OS's native webview instead of bundling Chromium,
and its Rust core is a better fit for spawning/supervising long-running
CLI tool subprocesses (recon/scan binaries) than Node's
`child_process` under Electron's model. Electron remains acceptable if a
specific required capability (e.g., a scanner-integration library that
only ships a robust Node binding) turns out to have no workable Tauri/Rust
equivalent — that determination is deferred to the roadmap's Phase 2
technical spike, not decided here.

### Browser-only (no desktop app at all), relying on WASM-compiled scanners

Rejected as the sole approach. Several required tools (Nmap raw sockets,
Amass, Whois, subprocess-based CLI tools in general) have no practical
WASM/browser equivalent, and local model inference (Ollama/LM Studio) and
Whisper.cpp/Piper require a real OS process, not a sandboxed tab. The web
app is kept as a legitimate secondary client (account/workspace
management, and AI chat via direct-from-browser calls to cloud providers
for users without the Desktop Agent installed) but cannot be the only
client.

### Full rewrite of the backend instead of a strangler-fig migration

Rejected. Modules 1-2 (and the metadata slices of 3-6) are already
architecturally correct under the new principle — they were built
following CQRS/repository-interface/domain-event conventions that don't
care whether the *source* of a `ReconResult` write is an in-process tool
runner or a remote Desktop Agent submitting the same shape over the same
endpoint. Rewriting them would trade a working, tested backend for
schedule risk with no architectural benefit. See the migration document's
Phase 1-5 breakdown.

## Consequences

**Positive**: private target/finding/evidence data never has to leave the
user's machine unless they opt in; the backend's infrastructure cost stops
scaling with scan volume; the product can truthfully offer an unlimited
free tier for all local functionality; users are never blocked by the
operator's AI provider quota or billing.

**Negative / accepted trade-offs**: the product now has three runtime
surfaces to maintain (backend, web, Desktop Agent) instead of two;
features that want to "just work" across all three (e.g., AI chat) need a
provider abstraction implemented twice (browser-direct calls for
web-only users, agent-mediated for desktop users); Team Collaboration and
cross-device sync become meaningfully harder to reason about once
"the data" can live in per-user local stores rather than one shared
database — the Metadata-Only sync tier exists specifically to keep
collaboration functional without requiring Everything-tier sync.
Distribution/signing/auto-update for three OS installers (Windows/Linux/
macOS) is new operational surface the project didn't previously have.

**Sequencing risk**: because scanner execution is currently the backend's
responsibility and the Desktop Agent doesn't exist yet, there is
necessarily a window (Phase 1-2 of the roadmap) where the product is
mid-migration — BYOK exists but the agent doesn't, or the agent runs
Recon but not Vuln yet. The migration document's phasing keeps the
existing backend paths functional throughout this window specifically to
avoid a broken intermediate state.

## Bugs found during this audit

1. `ai-provider-registry.service.ts` resolves provider credentials from
   server environment variables (`ConfigService<EnvConfig>`), meaning
   every workspace on a deployment shares the operator's AI keys today —
   the clearest existing violation of the local-first principle, and the
   first thing Phase 1 of the roadmap fixes.
2. `PrismaPayloadLibraryRepository`-style embedding of private content
   (findings, notes, recon results) into a server-side pgvector column
   happens unconditionally via `AiMemoryService.indexContent` — there is
   currently no opt-out, meaning "never upload private data" is already
   being violated for every workspace that has used AI features.
