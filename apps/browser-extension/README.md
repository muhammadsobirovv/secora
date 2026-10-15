# Secora AI — Browser Extension

A Manifest V3 browser extension (Chrome/Edge/Brave/Opera, plus a
separate Firefox build) that pairs with the Secora AI Desktop Agent
(Module 7) over its Local Bridge Server to capture recon targets,
trigger scans, and run AI analysis directly from the page you're
testing. See `../../docs/modules/08-browser-extension.md` for full
architecture, the Live Sync protocol, and a real-machine verification
checklist; see `../../docs/adr/0008-browser-extension-burp-integration.md`
for why this is built the way it is.

## Prerequisites

- Node.js 18+ and npm
- **Secora AI Desktop Agent** (Module 7) installed and running —
  its Local Bridge Server starts automatically with the app
- Chrome/Edge/Brave/Opera (Manifest V3) and/or Firefox

## Quick start

```bash
npm install
npm run build:chrome     # -> dist/chrome
npm run build:firefox    # -> dist/firefox
# or npm run build       # both targets

npm run dev:chrome       # watch mode
npm run typecheck
npm run lint
npm test                 # vitest — tests/*.test.ts
```

### Load unpacked (Chrome/Edge/Brave/Opera)

1. Navigate to `chrome://extensions` (or the equivalent in your
   browser).
2. Enable **Developer mode**.
3. **Load unpacked** → select `dist/chrome`.

### Load temporary (Firefox)

1. Navigate to `about:debugging#/runtime/this-firefox`.
2. **Load Temporary Add-on** → select `dist/firefox/manifest.json`.

Firefox needs its own manifest (`manifest.firefox.json`) because MV3's
background/side-panel APIs differ: Firefox uses a `background.scripts`
array instead of a `service_worker`, and `sidebar_action` instead of
`side_panel`.

## Pairing

1. In the Desktop Agent: **Settings → Browser Extension** — copy the
   **Server URL** and **Pairing Token**.
2. In the extension: click the toolbar icon → **Options** → paste both
   into the Desktop Agent Connection form → **Test Connection** →
   **Save**.

The pairing token is stored in `chrome.storage.local` (not `.sync`) —
it's machine-local by design, never synced to a browser account.

## What it does

- **Target Capture** (19 one-click actions) — URL, domain/subdomain,
  request/response, headers, cookies, local/session storage,
  screenshot, HTML, JavaScript, forms, API/GraphQL endpoints, WebSocket
  URLs, CSP/CORS/security headers — right-click or use the popup's
  quick-capture buttons.
- **Recon Shortcuts** (7, via right-click) — kick off Subfinder/HTTPX/
  Katana/Nuclei/ffuf jobs on the Desktop Agent against the current
  page's domain, no need to switch to the desktop app first.
- **AI Side Panel** — 11 quick actions (Explain Page, Analyze Forms,
  Analyze JavaScript, Find Interesting Endpoints, Analyze Security
  Headers, Analyze CSP, Analyze CORS, Suggest Payloads, Generate PoC,
  Generate Report Draft, Summarize Findings) plus free-form chat, with
  streaming responses, Markdown/Mermaid rendering, and voice
  input/output.
- **Bug Bounty Helpers** — auto-detects HackerOne/Bugcrowd/Intigriti/
  YesWeHack/Synack program pages and offers to import their scope
  directly into a Project.
- **DevTools panel** — 8 tabs surfacing headers, cookies, storage,
  security posture, interesting parameters, discovered API endpoints,
  detected technology, and a heuristic list of potential findings
  (missing CSP/HSTS/X-Frame-Options, dangerous CORS wildcard+
  credentials combos, etc.), each with a one-click **Save**.
- **Payload Library** — 35 built-in payloads across 12 categories
  (XSS, SQLi, SSRF, XXE, LFI, RFI, Open Redirect, JWT, SSTI, GraphQL,
  Command Injection, Template Injection), inserted straight into forms
  or copied to clipboard.
- **Export** — Markdown, JSON, HAR, TXT, ZIP, and PDF (via the
  browser's print-to-PDF), from the popup's recent-captures list.
- **Live Sync** — the popup/side panel always reflect whatever
  Project/Target is currently selected in the Desktop Agent (or in
  Burp, if the sibling Burp extension is also paired), and vice versa.

## Security

- The pairing token never leaves `chrome.storage.local`; it's never
  synced or transmitted anywhere except to the paired Bridge Server.
- Every non-streaming request/response body is AES-256-GCM encrypted
  end-to-end between the extension and the Desktop Agent
  (`shared/crypto.ts`), keyed by a value derived from the pairing token
  — see the module doc for why this is used instead of TLS.
- Capturing cookies, localStorage, sessionStorage, or anything that
  looks like a bearer token/password/API key/JWT/secret always shows a
  confirmation dialog first (`shared/sensitivity.ts`) — nothing
  sensitive is ever sent without an explicit click, enforced again
  server-side by the Desktop Agent as defense in depth.

## Project layout

```
background/    Service worker — bridge client, capture handlers,
               context menus, recon shortcuts, passive network capture,
               message router, bug-bounty scope import
content/       Content scripts — DOM extraction, bug-bounty scope
               scraping, screenshot area-selection overlay
popup/         Quick-capture UI
sidepanel/     AI chat panel
options/       Settings page
devtools/      DevTools panel
shared/        Framework-agnostic logic: crypto, bridge client, storage,
               payload library, screenshot tooling, export, voice,
               sensitivity detection, UI kit
tests/         vitest unit tests
scripts/       esbuild-based build (build.mjs) and packaging (zip.mjs)
```

## Verification status

Built and reviewed in a sandbox with no browser, no completed
`npm install`, and no way to run `vitest`. The crypto and pure-logic
modules (`shared/crypto.ts`, `shared/sensitivity.ts`,
`shared/payloads.ts`, `shared/export.ts`) were independently verified
by executing them directly with Node's native TypeScript support — see
`../../docs/modules/08-browser-extension.md`'s "Verification handoff"
section for the exact method and results, and for the full list of
commands to run on a real machine before shipping.
