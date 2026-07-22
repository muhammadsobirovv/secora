# PentestHub AI — Desktop Agent

Module 7. Tauri (Rust + React/TypeScript) desktop app — the local
execution engine for recon, scanning, AI, RAG, voice, and reporting. See
`docs/adr/0007-local-first-desktop-agent-architecture.md` for why this
exists and `docs/modules/07-desktop-agent.md` for the full design.

## Prerequisites (not available in the build sandbox — run these yourself)

- Rust toolchain (`rustup`, stable channel, 1.77+) — <https://rustup.rs>
- Node.js 18+ and `pnpm` (already required by the rest of the monorepo)
- Tauri's OS-level prerequisites — <https://tauri.app/start/prerequisites/>
  (WebView2 on Windows, `webkit2gtk`/`libayatana-appindicator3` on Linux,
  Xcode Command Line Tools on macOS)
- The recon/scanner CLI tools you want to actually run locally (Subfinder,
  Amass, Katana, HTTPX, Naabu, DNSX, GAU, Waybackurls, Nuclei, ffuf,
  dirsearch, Feroxbuster, Nikto, Dalfox, SQLMap, XSStrike) — the app
  detects what's on `PATH` at runtime (Settings > Tools) rather than
  bundling them.
- Optional, only if you want fully-offline Voice: `whisper.cpp` (STT) and
  `Piper` (TTS) binaries + models — see Settings > Voice. The default
  Voice backend is the browser's Web Speech API and needs neither.
- Optional, only if you want a Plugin (Nmap/Burp/ZAP/Metasploit/custom
  script): the corresponding binary on `PATH` or an absolute path entered
  in Settings > Plugins.

## Development

```bash
cd apps/desktop
pnpm install
pnpm tauri:dev
```

## Building installers

```bash
pnpm tauri:build
```

Produces an NSIS/MSI installer on Windows, a `.deb`/`.rpm`/AppImage on
Linux, and a `.dmg`/`.app` on macOS (see `src-tauri/tauri.conf.json`'s
`bundle.targets`). Cross-compiling installers for a *different* OS than
the one you're building on is not supported by Tauri — build each
platform's installer on that platform (or in that platform's CI runner).

## Icons

`src-tauri/tauri.conf.json` references icon files under
`src-tauri/icons/` that are not checked in yet (binary assets). Generate
them from a single source PNG before running `pnpm tauri:build`:

```bash
pnpm tauri icon path/to/source-icon.png
```

## What's implemented vs scaffolded

See `docs/modules/07-desktop-agent.md`'s "Implementation status" section
— this file is kept up to date as each Module 7 sub-system lands.
