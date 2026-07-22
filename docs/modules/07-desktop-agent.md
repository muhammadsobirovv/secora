# Module 7 — Desktop Agent

Tauri (Rust + React/TypeScript) desktop app at `apps/desktop`. The local
execution engine for recon, scanning, AI, RAG, voice, and reporting — see
`docs/adr/0007-local-first-desktop-agent-architecture.md` for why this
exists and what it does *not* do (the backend never executes scanners).

## Implementation status

Module 7 is **source-complete**: every sub-system below has real,
non-placeholder Rust/TypeScript source. "Sandbox-verified" means `cargo
check`/`cargo build`/`pnpm build` actually ran; the environment this was
written in has no Rust toolchain and no network access to crates.io/npm,
so **nothing below has been compiled or runtime-tested yet** — see
"Verification handoff" below for the exact commands to run on a real
machine before shipping.

| Area | Status | Notes |
|---|---|---|
| Project scaffold (Cargo workspace, Tauri config, Vite frontend) | Source-complete | `apps/desktop/src-tauri`, `apps/desktop/src` |
| ToolRunner framework | Source-complete | `services/tool_runner.rs`, `services/tool_process.rs` |
| Recon tool adapters (8) | Source-complete | Subfinder, Amass, Katana, HTTPX, Naabu, DNSX, GAU, Waybackurls |
| Scanner tool adapters (8) | Source-complete | Nuclei, ffuf, dirsearch, Feroxbuster, Nikto, Dalfox, SQLMap, XSStrike |
| Background Job Queue | Source-complete | `queue/mod.rs` — priority, concurrency, retry, heartbeat, crash recovery, pause/resume |
| Local SQLite database | Source-complete | `migrations/0001_init.sql`, `migrations/0002_payloads.sql`, `storage/repositories/*` |
| Sync Engine | Source-complete | `sync/` — Off/Metadata-Only/Everything modes, push/pull, LWW conflict resolution + `CONFLICT` escape hatch, exponential-backoff retry queue, OS-keychain token storage, multi-workspace |
| Local AI provider connectors (9) | Source-complete | Ollama, LM Studio, OpenAI, Anthropic, Gemini, OpenRouter, Groq, DeepSeek, Azure OpenAI — streaming, tool calling, conversation history, provider switching without restart |
| Local RAG | Source-complete | `rag/` — SQLite FTS5 keyword search (offline-guaranteed) + brute-force cosine-similarity semantic search; indexes Notes/Reports/Findings/Payloads/Evidence/Chat history |
| Voice (STT/TTS) | Source-complete | `voice/` — Web Speech API (frontend, default) + whisper.cpp/Piper local fallback (Rust) |
| File Manager / Evidence Library | Source-complete | `storage/repositories/evidence.rs`, `services/file_watcher.rs`, `services/hashing.rs` — SHA-256 dedup, Folder Watch, drag-drop |
| Report Generator | Source-complete | `reports/` — PDF (printpdf), Markdown, HTML (pulldown-cmark), DOCX (docx-rs), TXT, JSON, ZIP, all from one `ReportData` aggregation |
| Desktop Chat UI | Source-complete | `src/features/chat/` — streaming, Markdown/Mermaid/syntax highlighting, code-block Copy/Save/Download, conversation search/pin/bookmark/export |
| Settings / Auto-Update / Plugin System / Security | Source-complete | `src/features/settings/`, `plugins/`, `security/` — Tauri updater (signed), Plugin Manager (Nmap/Burp/ZAP/Metasploit/Custom Script templates), AES-256-GCM encrypted backups |
| Frontend UI parity with web app | Source-complete | Dashboard/Projects/Project detail (Targets/Jobs/Notes/Evidence/Reports)/Chat/Settings, Command Palette, theme, loading/empty/error states |
| Tests | Partial | Unit tests added for pure-logic modules (`sync::queue` backoff, `rag` cosine similarity, `services::hashing` MIME table); no integration/e2e harness yet (needs a real SQLite file + compiled binary) |

## Architecture

```
apps/desktop/
  src-tauri/            Rust backend (Tauri)
    src/
      commands/         #[tauri::command] handlers — the only public IPC surface
      services/         Shared ToolRunner trait + subprocess spawning + file hashing/watching
      recon/            8 recon tool adapters
      scanner/          8 vuln-scan tool adapters
      queue/            Background Job Queue (priority/retry/heartbeat/crash-recovery)
      storage/          SQLite (sqlx) — migrations + one repository per table group
      ai/               Local AI provider connectors + OS-keychain credential storage + chat orchestration
      rag/               Local RAG — FTS5 keyword index + embedding-based semantic search
      voice/             STT/TTS — whisper.cpp/Piper local fallback (Web Speech API lives in the frontend)
      reports/            Report Generator — Markdown/HTML/PDF/DOCX/TXT/JSON/ZIP renderers
      sync/               Sync Engine (Off/Metadata-Only/Everything)
      plugins/            Plugin Manager — Nmap/Burp/ZAP/Metasploit/Custom Script
      security/           OS-keychain secret management + AES-256-GCM local backup encryption
      ipc/               Shared IPC helpers beyond raw Tauri commands
      state.rs           AppState — wires every repository/service/engine together
      lib.rs / main.rs   Tauri Builder, plugin registration, command registration
    migrations/          SQL migration files (sqlx::migrate!)
    capabilities/        Tauri v2 permission grants
  src/                   React/TypeScript frontend (Vite)
    lib/tauri-client.ts  Typed wrapper over invoke() — one function per command
    app/                 Root shell (AppShell sidebar, CommandPalette, router)
    features/
      dashboard/          Overview: project count, tool availability, AI provider status
      projects/           Projects list + detail (Targets/Jobs/Notes/Evidence/Reports tabs)
      chat/                Desktop AI Chat — streaming, Markdown/Mermaid/CodeBlock, export
      settings/            Appearance/AI/Voice/Sync/Tools/Plugins/Security/Updates
    components/ui.tsx      Shared Button/Card/Input/Badge/Skeleton/EmptyState/ErrorState kit
    hooks/useTheme.ts       Light/dark/system theme store
```

### Why one ToolRunner trait spans both recon/ and scanner/

The spec's "Local Tool Runner" section lists all 16 tools (8 recon-style
discovery tools, 8 vuln-scan tools) as one system. `services/tool_runner.rs`
defines a single `ToolRunner` trait and a generic `ToolRegistry`; `recon/`
and `scanner/` each hold adapters implementing it, split by domain the
same way the backend splits `ReconTool` from `ScannerName` — but sharing
one execution/cancellation/timeout/retry implementation
(`services/tool_process.rs`) instead of two, unlike the backend which
built `spawn-tool-process.util.ts` once for recon and a near-duplicate for
vuln (see the Module 3/4 ADRs). Adding a 17th tool later means one adapter
file + one registry line, in whichever of `recon/adapters` or
`scanner/adapters` it belongs to. The Plugin Manager (`plugins/mod.rs`)
reuses the exact same `services::tool_process::spawn_tool` primitive for
user-registered external tools (Nmap/Burp/ZAP/Metasploit/custom scripts),
so a plugin gets the same argv-only, never-a-shell-string safety guarantee
a built-in tool does.

### Crash recovery

Every job's `heartbeat_at` column is touched every 5 seconds while it
runs. On startup, `JobQueue::recover()` requeues any job still marked
`RUNNING` whose heartbeat is more than 60 seconds stale — the signal that
the app was killed (crash, force-quit, OS shutdown) mid-job rather than
the job finishing cleanly.

### Local secrets

`ai_provider_credentials` (SQLite) stores only a `keyring_ref` and a
`key_preview` — the actual API key lives in the OS-native credential
store (Windows Credential Manager / macOS Keychain / Linux Secret
Service) via the `keyring` crate (`ai/credentials.rs`), never as
plaintext in the SQLite file. This is stricter than the backend's Phase 1
BYOK (AES-256-GCM with an app-managed key), which is the right trade-off
here since the Desktop Agent has no separate "operator" secret to
encrypt against — the OS keychain already solves that. The Sync Engine's
bearer token (`sync/mod.rs`) and the backup-encryption key
(`security/keychain.rs`) follow the same pattern.

### Sync Engine design

`sync::engine::SyncEngine::sync_once()` is table-driven rather than
enqueue-driven: it scans each registered table (`sync::ENTITIES`) for rows
whose `sync_status != 'SYNCED'` and pushes them, rather than requiring
every write path across the app to remember to enqueue a sync job. This is
self-healing (a crash between a local write and a queue write can't
silently drop a change) at the cost of a periodic scan, which is cheap at
desktop data volumes. `offline_queue` is retry/backoff bookkeeping, not
the primary work queue — one row per failing `(entity_type, entity_id)`
holding an attempt counter for exponential backoff. Conflict resolution is
last-write-wins by `updated_at`, with a `CONFLICT` escape hatch: if a pull
discovers the remote changed *and* the local row has unsynced edits, it's
flagged for the user to resolve via Settings > Sync rather than silently
overwritten either direction. This targets a backend `/desktop-sync/*`
API surface that is Phase 2 work per ADR 0007 — the client is fully
implemented against that contract now, so sync activates the moment the
backend endpoints exist; until then, every push/pull attempt degrades
gracefully to a logged retry-queue entry.

### Report Generator design

One `reports::data::collect()` aggregation query feeds seven renderers.
`markdown::render()` is the canonical intermediate form; `html::render()`
runs it through `pulldown-cmark`, `txt::render()` strips the lightweight
markup back out, `json::render()` is the raw struct, and `pdf::render()`/
`docx::render()` walk the Markdown line-by-line mapping headings/bullets/
paragraphs into `printpdf`/`docx-rs` calls (both pure-Rust, no system PDF
engine or LibreOffice dependency). `zip::render()` bundles all of the
above plus the project's evidence files into one archive. PDF/DOCX/ZIP
generation runs on `tokio::task::spawn_blocking` since those writers are
synchronous and CPU-bound.

### Plugin Manager design

`plugins::PluginRegistry` is backed by the `plugins` table and a small
`PluginManifest` schema (`kind`, `binary`, `args_template` with
`{target}`/`{project}` placeholders, `timeout_seconds`).
`plugins::builtin_templates()` offers pre-filled manifests for Nmap, Burp
Suite (via a CLI wrapper script — Burp itself has no stable bare CLI),
OWASP ZAP, Metasploit, and a generic Custom Script escape hatch; the user
only has to point `binary` at their local install. Execution
(`PluginRegistry::run`) goes through the same `spawn_tool` primitive as
every built-in tool.

## Verification handoff

Nothing in this module has run through a compiler in the environment it
was written in (no Rust toolchain, no crates.io/npm network access). On a
real machine, in order:

```bash
# 1. Rust backend
cd apps/desktop/src-tauri
cargo check          # first pass — expect to fix minor API drift in
                      # reports/pdf.rs and reports/docx.rs especially,
                      # since printpdf/docx-rs were used from training
                      # knowledge without a compiler to verify call sites
cargo clippy
cargo test            # sync::queue backoff, rag cosine similarity,
                       # services::hashing MIME table

# 2. Frontend
cd apps/desktop
pnpm install
pnpm check-types
pnpm lint
pnpm build

# 3. Full app
pnpm tauri:dev         # smoke test every feature manually against a
                        # real SQLite file and real tool binaries
```

Known things to double check once compiling: `printpdf`/`docx-rs`
call-site accuracy (flagged in-file), the `capabilities/default.json`
fs-scope entries for the Save/Export dialogs (Tauri validates capability
schemas at build time and will reject anything malformed), and generating
a real updater keypair via `tauri signer generate` to replace the
placeholder pubkey in `tauri.conf.json`.

## Building

See `apps/desktop/README.md` for prerequisites and dev/build commands.
