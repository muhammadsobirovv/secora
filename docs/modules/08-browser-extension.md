# Module 8 — Browser Extension + Burp Suite Integration

A Manifest V3 browser extension (`apps/browser-extension`, Chrome/Edge/
Brave/Opera + a separate Firefox manifest) and a Burp Suite extension
(`extensions/burp`, Jython/legacy Extender API), both talking to the
Module 7 Desktop Agent over a new **Local Bridge Server**
(`apps/desktop/src-tauri/src/bridge/`) — see
`docs/adr/0008-browser-extension-burp-integration.md` for why a bridge
server was necessary and the encryption/Jython trade-offs.

## Implementation status

Module 8 is **source-complete**: every sub-system below has real,
non-placeholder Rust/TypeScript/Jython source. As with Module 7, this
sandbox has no Rust toolchain, no `npm install` capacity for a full
dependency tree (see "Verification handoff"), no Burp Suite, and no
browser to load an unpacked extension into — so **nothing below has run
as a built extension or compiled Tauri binary yet**. What *has* been
verified: the pure-logic TypeScript modules were executed directly via
Node's native TypeScript support, and the AES-256-GCM + HKDF-SHA256
crypto was cross-checked byte-for-byte across the Rust, TypeScript, and
Python (as a Jython proxy) implementations. Both are detailed below.

| Area | Status | Notes |
|---|---|---|
| Local Bridge Server (Rust, in Desktop Agent) | Source-complete | `apps/desktop/src-tauri/src/bridge/` — axum HTTP+WS, `127.0.0.1`-only, bearer auth, AES-256-GCM envelope encryption |
| Target Capture (19 one-click actions) | Source-complete | `background/capture-handlers.ts`, `content/page-inspector.ts`, `background/network-capture.ts` |
| Recon Shortcuts (7 context-menu actions) | Source-complete | `background/recon-shortcuts.ts`, `background/context-menus.ts` — maps to `/api/jobs` (Subfinder/HTTPX/Katana/Nuclei/ffuf) |
| AI Side Panel (11 quick actions + streaming/markdown/mermaid/voice) | Source-complete | `sidepanel/` — `Markdown.tsx`/`CodeBlock.tsx`/`Mermaid.tsx`, `shared/voice.ts`, conversation persistence via `X-Conversation-Id` |
| Capture System + mandatory sensitive-data confirmation | Source-complete | `shared/sensitivity.ts` (client heuristic) + `bridge::captures::handle_capture` (server-side reject-unless-confirmed) — defense in depth |
| Bug Bounty Helpers (HackerOne/Bugcrowd/Intigriti/YesWeHack/Synack scope import) | Source-complete | `content/bugbounty-scope.ts` (platform detection + DOM scrape), `background/bugbounty-import.ts` |
| Burp Suite Extension (Community + Pro) | Source-complete | `extensions/burp/` — Jython, legacy `IBurpExtender` API, see its own README |
| Live Sync | Source-complete | `bridge::live` (hub) + `background/bridge.ts` (client) + `pentesthub_burp/context_menu.py` (reads `/api/live-sync`) — protocol documented below |
| Screenshot System | Source-complete | `shared/screenshot.ts` — OffscreenCanvas viewport/full-page capture, region crop, box blur redaction, sha256 hash |
| Payload Library (12 categories) | Source-complete | `shared/payloads.ts` — 35 built-in payloads across XSS/SQLi/SSRF/XXE/LFI/RFI/Open Redirect/JWT/SSTI/GraphQL/Command Injection/Template Injection |
| Developer Tools panel | Source-complete | `devtools/` — 8 tabs (Headers/Cookies/Storage/Security/Interesting Parameters/API Discovery/Technology/Potential Findings), heuristic finding detection |
| Export (6 formats) | Source-complete | `shared/export.ts` — Markdown/JSON/HAR/TXT/ZIP/PDF (print-to-PDF) |
| Voice | Source-complete | `shared/voice.ts` — Web Speech API, DOM-context only (popup/sidepanel/options, not background) |
| Settings | Source-complete | `options/OptionsApp.tsx` — pairing, AI provider, theme/language, capture rules, privacy, notifications, keyboard shortcuts |
| Security | Source-complete | AES-256-GCM app-layer encryption on every non-streaming Bridge route, bearer-token pairing, `127.0.0.1`-only bind, sensitive-capture confirmation gate at both client and server |
| Tests | Partial, but with real runtime verification | `tests/*.test.ts` (vitest, not executed via vitest — see below); `crypto.ts`/`sensitivity.ts`/`payloads.ts`/`export.ts` independently re-verified via direct Node execution |

## Architecture

```
apps/desktop/src-tauri/src/bridge/   Local Bridge Server (new in Module 8)
  mod.rs         Router assembly (public / streaming / authenticated tiers), spawn()
  auth.rs        Bearer-token middleware, token generation, constant-time compare
  crypto.rs      AES-256-GCM envelope encryption, HKDF-SHA256 key derivation
  middleware.rs  encrypt_layer — request decrypt / response encrypt
  state.rs       BridgeState (cloned AppState + crypto key + LiveSyncHub)
  dto.rs         Wire-format request/response bodies (deliberately separate from Tauri command DTOs)
  captures.rs    handle_capture — routes by capture_type, enforces sensitive+confirmed gate
  routes.rs      All HTTP handlers
  live.rs        LiveSyncHub — in-memory state + broadcast channel
  ws.rs          WebSocket upgrade + message loop

apps/browser-extension/
  manifest.chrome.json / manifest.firefox.json   MV3 manifests (Firefox needs its own: background.scripts vs service_worker, sidebar_action vs side_panel)
  background/    Service worker — bridge client, capture handlers, context menus, recon shortcuts, network capture, message router, bug-bounty import
  content/       Isolated-world scripts — DOM extraction, bug-bounty scope scraping, area-selection overlay (has DOM access, no chrome.tabs/cookies/webRequest)
  popup/         Quick-capture UI, project/target selectors, recent captures + export
  sidepanel/     AI chat — 11 quick actions, streaming markdown/mermaid, voice
  options/       Settings page
  devtools/      DevTools panel (8 tabs)
  shared/        Everything with no chrome.* dependency beyond what's noted per-file: crypto, bridge-client, storage, payloads, screenshot, export, voice, sensitivity, constants, platform, ui, messaging
  tests/         vitest test files (crypto/sensitivity/payloads/export)

extensions/burp/
  pentesthub.py           BurpExtender entry point
  pentesthub_burp/         crypto.py, bridge_client.py, settings.py, ui.py, context_menu.py, http_listener.py
  tests/test_crypto.py     Jython crypto test (unexecuted here — no Jython interpreter in sandbox)
  README.md                 Install/pairing/usage/security/verification handoff for the Burp side specifically
```

### Why a Local Bridge Server was necessary

Module 7 built a complete Tauri command surface, but `invoke()` only
works from inside the Tauri webview's own JS runtime. The Browser
Extension's background service worker and the Burp Extension's Jython
process are both separate OS processes — they need a real, addressable
network API. `bridge::mod::spawn` starts one axum server per Desktop
Agent instance, reusing the exact same repositories/services the Tauri
commands use via a cloned `AppState` (see `bridge::state::BridgeState`),
so the bridge is a second *transport*, never a second copy of business
logic. Full reasoning: `docs/adr/0008-browser-extension-burp-integration.md`.

### Router tiers, and why streaming routes are excluded from encryption

`bridge::mod::build_router` splits into three tiers: `public`
(`/api/health`, no auth), `streaming` (bearer-auth only —
`/api/ai/analyze` SSE and `/api/ws`), and `authenticated` (bearer-auth
+ AES-GCM envelope encryption — everything else). This is structural,
not incidental: `encrypt_layer` buffers the entire response body via
`axum::body::to_bytes` before it can encrypt it, which would silently
convert real-time SSE/WS streaming into "block until done, deliver
everything at once" if applied uniformly. This was caught during Side
Panel conversation-id wiring and fixed by making the split a separate
router tier rather than a special case inside the middleware, so a
future streaming route added to the wrong tier fails loudly (no
encryption applied where none is expected) rather than silently
breaking streaming.

### Encryption: AES-256-GCM app-layer, not TLS

The Bridge Server encrypts request/response bodies at the application
layer (`bridge::crypto`, `bridge::middleware::encrypt_layer`) instead of
terminating TLS with a self-signed certificate. A self-signed cert on
`127.0.0.1` means every browser — and specifically a Manifest V3
background service worker calling `fetch()` — either has to have the
cert manually trusted by the OS first, or every request throws until it
is. That's a worse pairing experience than "paste a token," for a
threat model where the transport is already `127.0.0.1`-only (no
network attacker) and the plaintext-on-localhost risk being defended
against is a second, unrelated local process reading traffic — which
AES-GCM (keyed by a token only the paired extension/Burp/desktop know)
defends against equally well without the cert UX cost. See
`bridge::crypto`'s doc comment for the same reasoning in-code.

Key derivation: `HKDF-SHA256(salt=empty, ikm=pairing_token,
info="pentesthub-bridge-aes-gcm-v1")` → 256-bit AES key. Implemented
three times — Rust (`hkdf` crate), TypeScript (WebCrypto
`crypto.subtle`), Jython (`javax.crypto`/hand-rolled HKDF via `Mac`/
`HmacSHA256`) — and cross-checked to produce byte-identical output (see
"Verification handoff" below for the exact vector).

Envelope format on the wire (`Content-Type:
application/vnd.pentesthub.enc+json`):

```json
{ "v": 1, "iv": "<base64, 12 bytes>", "ct": "<base64, ciphertext+tag>" }
```

### Sensitive-data confirmation: defense in depth

The spec requires the extension "never automatically upload sensitive
data without confirmation." Enforced at two independent layers:

1. **Client-side, primary**: `shared/sensitivity.ts`
   (`isSensitiveCapture`/`sensitivityReason`) — always flags
   cookies/localStorage/sessionStorage captures regardless of content,
   plus regex detection of bearer tokens, passwords, API keys, JWTs,
   `Set-Cookie`, SSNs, and card numbers in any other capture type. This
   is the layer that can actually show the user a confirmation dialog,
   since only the extension knows what's on the page. `message-router.ts`
   respects the caller's `confirmed` flag rather than hardcoding `true`
   (an early draft did hardcode it — see the Module 8 build notes; fixed
   before this was ever shipped).
2. **Server-side, defense in depth**: `bridge::captures::handle_capture`
   rejects any `CaptureRequest` with `sensitive: true` unless
   `confirmed: true` is also set, regardless of what the client claims —
   protects against a compromised or buggy extension build that skips
   its own dialog.

The Burp Extension's `http_listener.py` follows the same principle a
different way: it is **passive-only** — it never auto-uploads anything
from proxied traffic, only logs a one-line local suggestion (server
errors, secret-shaped strings) for the user to act on manually via a
right-click.

### Live Sync protocol

`bridge::live::LiveSyncHub` holds one small `LiveSyncState` behind an
`RwLock`, mutated by whichever client (Desktop UI, Browser Extension,
Burp) last called `POST /api/live-sync`, and fans out a lightweight
invalidation ping over `/api/ws` to every other connected client.
Deliberately not event-sourced or CRDT — the state is small "what am I
looking at right now" UI context, last-write-wins is the right model
for it, and every client re-fetches the authoritative snapshot via
`GET /api/live-sync` on receiving a ping rather than trusting a partial
WS payload. This mirrors the Sync Engine's push/pull separation from
Module 7 at a much smaller scale: WS is the invalidation signal, REST is
the data.

**State shape** (`GET /api/live-sync` response / `POST /api/live-sync`
body, all fields optional — a `POST` is a partial patch, `null`/omitted
fields are left unchanged):

```json
{
  "currentProjectId": "string | null",
  "currentTargetId": "string | null",
  "currentConversationId": "string | null",
  "currentScanJobId": "string | null",
  "clipboard": "string | null",
  "updatedAt": "RFC3339 timestamp, server-set",
  "updatedBy": "\"desktop\" | \"extension\" | \"burp\""
}
```

**WebSocket messages** (`GET /api/ws?token=<pairing-token>`, JSON text
frames, server → client only — the server ignores any client-sent
payload by design, this is a broadcast channel not a command channel):

```json
{ "kind": "ping", "reason": "state-changed" }
```
```json
{
  "kind": "notification",
  "notification": {
    "type": "Info" | "Success" | "Warning" | "Finding",
    "title": "string",
    "message": "string",
    "findingId": "string (only present when type is Finding)"
  }
}
```

On receiving a `ping`, clients re-`GET /api/live-sync` for the fresh
snapshot rather than trying to reconstruct state from the ping itself.
`notification` messages are terminal — rendered directly (e.g. the
Side Panel's toast/notification list), no follow-up fetch needed.

Job/scan progress specifically is *not* pushed through this hub: rather
than rewiring Module 7's existing Tauri event emitters
(`job://{id}/log`, etc.) to also feed Live Sync, `currentScanJobId` is
set once when a job starts from the extension
(`background/recon-shortcuts.ts` → `POST /api/jobs`) and the extension
short-polls `GET /api/jobs/:id` for live progress — avoiding a second
event-plumbing path for data the Job Queue already exposes.

### Bridge Server route table

```
public   (no auth):            GET  /api/health
streaming (bearer only):       POST /api/ai/analyze   (SSE)
                                GET  /api/ws            (WebSocket, ?token=)
authenticated (bearer+AES-GCM): POST /api/pair
                                GET  /api/projects
                                GET  /api/targets
                                POST /api/captures
                                GET/POST /api/jobs
                                GET  /api/jobs/:id
                                GET/POST /api/findings
                                PATCH|POST /api/findings/:id/status
                                POST /api/notes
                                GET/POST /api/payloads
                                GET/POST /api/live-sync
```

### Cross-language protocol parity

One wire protocol — JSON DTOs, the `{v, iv, ct}` AES-GCM envelope,
bearer-token auth — implemented three times (Rust bridge, TypeScript
extension, Jython Burp extension) with matching HKDF info strings and
key derivation. Parity was verified directly in this sandbox (see next
section) rather than assumed, since a mismatch here would silently
break every encrypted route between one client and the Desktop Agent.

## Verification handoff

### What was actually verified in this sandbox

No Rust toolchain, no completed `npm install` (every attempt exceeded
the 45-second per-call hard timeout — see below), no Burp Suite, no
Jython interpreter, and no browser were available here. What *was*
verified, without needing any of those:

**1. Cross-language crypto compatibility** — confirmed byte-identical
HKDF-SHA256 key derivation (salt=empty, info=
`"pentesthub-bridge-aes-gcm-v1"`) for the token `"test-token-12345"`
across three independent implementations:

- Python's `cryptography` library (`pip install cryptography
  --break-system-packages`) as a reference implementation
- A hand-rolled HMAC-SHA256-based HKDF in Python (matching the actual
  logic in both `bridge::crypto` (Rust) and `pentesthub_burp/crypto.py`
  (Jython) line-for-line)
- The real `apps/browser-extension/shared/crypto.ts`, executed directly
  via `node --experimental-strip-types --experimental-transform-types`

All three produced the same 32-byte key
(`28752a02bb3aef54ca14048ae7ba850e78664b9ba92cf525610d0a5cd3afd9b`) for
that vector. AES-256-GCM envelope seal/open round-tripped correctly in
both the Python and Node runs.

**2. Pure-logic TypeScript modules, executed for real** — using Node
22's `--experimental-strip-types --experimental-transform-types` flags
to run `.ts` source directly with zero build step (this sandbox
couldn't complete an `npm install` of even a single package like
`vitest` within the 45-second call limit, so `vitest run` itself never
executed — this was the alternative):

```
shared/crypto.ts       — deriveKey/seal/open round-trip, wrong-key rejection
shared/sensitivity.ts  — isSensitiveCapture/sensitivityReason against the
                          exact cases in tests/sensitivity.test.ts
shared/payloads.ts     — every payload has a declared category, unique id,
                          non-empty example; all 12 categories covered
shared/export.ts       — toMarkdown/toJson/toHar against the exact cases
                          in tests/export.test.ts
```

All passed. An additional ~19 files were import-checked via Node's
native ESM loader; 8 passed standalone, the rest failed only on Node's
strict requirement for explicit `.ts` extensions on relative imports —
a resolver artifact of running raw Node against TS source, not a
real bug (esbuild, the actual bundler configured in
`scripts/build.mjs`, has no such requirement).

### What still needs a real machine, in order

```bash
# 1. Desktop Agent — Rust (adds the Bridge Server to Module 7's app)
cd apps/desktop/src-tauri
cargo check                # expect to fix minor axum/hkdf API drift —
                            # written from training knowledge without a
                            # compiler available to verify call sites
cargo clippy
cargo test                  # bridge::crypto unit tests (round-trip,
                             # wrong-key rejection, base64, different
                             # tokens → different keys) among others

# 2. Browser Extension
cd apps/browser-extension
npm install
npm run typecheck
npm run lint
npm test                    # vitest — tests/crypto.test.ts,
                             # tests/sensitivity.test.ts,
                             # tests/payloads.test.ts, tests/export.test.ts
npm run build:chrome
npm run build:firefox

# Load unpacked in Chrome/Edge/Brave/Opera:
#   chrome://extensions -> Developer mode -> Load unpacked -> dist/chrome
# Load unpacked in Firefox:
#   about:debugging#/runtime/this-firefox -> Load Temporary Add-on ->
#   dist/firefox/manifest.json

# 3. Pair the extension
#   Desktop Agent: Settings > Browser Extension -> copy Server URL + Token
#   Extension: click the toolbar icon -> Options -> paste both -> Test
#   Connection -> Save

# 4. Burp Suite Extension — see extensions/burp/README.md's own
#    "Verification handoff" section (Jython install, Extender load steps,
#    context-menu smoke test)

# 5. End-to-end smoke test (manual, per the spec's "Testing" section)
#   - Target Capture: right-click a page element, try each of the 19
#     one-click actions, confirm each lands in the right Project/Target
#   - Recon Shortcuts: run each of the 7 from the context menu, confirm
#     a job appears in the Desktop Agent's Jobs list
#   - AI Side Panel: try each of the 11 quick actions, confirm streaming
#     renders token-by-token (not all-at-once — the regression the
#     streaming/encryption tier split above specifically prevents),
#     confirm Markdown/Mermaid/code blocks render, confirm voice
#     input/output work
#   - Sensitive capture: try capturing cookies on a real page, confirm
#     the confirmation dialog appears and a save without confirming is
#     rejected (check the Desktop Agent doesn't receive it)
#   - Bug Bounty import: open a HackerOne/Bugcrowd/Intigriti/YesWeHack/
#     Synack program page, confirm scope auto-detection + import
#   - Live Sync: switch Project in the Desktop Agent UI, confirm the
#     popup/side panel picks up the change within one WS ping; switch
#     target from Burp's tab, confirm the extension sees it too
#   - Exports: try all 6 formats (Markdown/JSON/HAR/TXT/ZIP/PDF) against
#     a handful of captures
#   - Keyboard shortcuts: confirm each configured shortcut in Options
#     fires its bound action
```

Known things to double check once compiling: axum 0.7's exact
middleware/extractor signatures for `encrypt_layer` and
`require_token` (flagged as the riskiest file in `bridge::middleware`'s
own doc comment), whether `chrome.sidePanel` vs Firefox's
`sidebar_action` API difference (`shared/platform.ts::openSidePanel`)
needs any additional per-browser-version guarding, and OffscreenCanvas
availability in the exact Chrome/Firefox versions targeted for
`shared/screenshot.ts`'s full-page stitching path.

## Building

See `apps/browser-extension/README.md` for the extension's own quick
start, and `extensions/burp/README.md` for the Burp extension's
install/pairing/usage guide.
