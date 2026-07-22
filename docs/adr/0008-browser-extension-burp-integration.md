# ADR 0008 — Local Bridge Server, app-layer encryption, and Jython for Burp

Status: accepted, Module 8 (Browser Extension + Burp Suite Integration)
source-complete as of 2026-07-20 — see
`docs/modules/08-browser-extension.md`'s "Implementation status" table
and "Verification handoff" section (written without a Rust/npm/Jython
toolchain, browser, or Burp Suite available; needs `cargo build`/
`npm install && npm run build`/manual extension-loading and Burp
smoke-testing on a real machine before shipping).

Context: ADR 0007 established the Desktop Agent (Module 7) as the
execution environment for recon/scanning/AI/reports, reachable only via
Tauri's `invoke()` IPC from inside its own webview. Module 8's spec
requires a Browser Extension and a Burp Suite extension — both separate
OS processes — to drive that same Desktop Agent: one-click target
capture, recon shortcuts, AI analysis, and Live Sync of "what
project/target am I looking at right now" between all three surfaces
(desktop app, browser, Burp).

---

## Decision

1. **A new Local Bridge Server** (`apps/desktop/src-tauri/src/bridge/`)
   is added to the Desktop Agent: a plain axum HTTP+WebSocket server,
   bound strictly to `127.0.0.1`, started alongside everything else
   `AppState` wires up in `lib.rs::run()`'s `setup()`. It is a second
   *transport* for the same backend Module 7 already built (it holds a
   cloned `AppState` and calls the same repositories/services Tauri
   commands call) — not a second implementation of any business logic.
2. **Bearer-token pairing, not auto-discovery.** A token is generated
   once (or rotated on demand) and stored in the OS keychain
   server-side; the user copies it manually into the extension/Burp's
   Options UI. No mDNS/broadcast discovery, no default-open access.
3. **AES-256-GCM application-layer encryption** for every non-streaming
   request/response body, keyed by HKDF-SHA256 over the pairing token —
   chosen over TLS with a self-signed certificate.
4. **The WebSocket and SSE routes (`/api/ws`, `/api/ai/analyze`) are
   excluded from the encryption middleware** and live in their own
   router tier, bearer-auth only. This is structural (a separate
   `Router` merge), not a per-request branch inside the middleware.
5. **The Burp Suite extension is written in Jython against the legacy
   `IBurpExtender`/`ITab`/`IContextMenuFactory`/`IHttpListener` API**,
   not the modern Montoya API.
6. **Sensitive-data capture requires explicit confirmation, enforced at
   two layers**: client-side heuristic detection + dialog (primary,
   since only the client knows page content), and server-side rejection
   of any `sensitive: true` capture that isn't also `confirmed: true`
   (defense in depth). The Burp extension's traffic listener is
   passive-only and never auto-uploads anything from proxied requests.

## Alternatives considered

### Route everything through Tauri's own `invoke()` IPC somehow

Rejected outright — not actually possible. `invoke()` is a webview-JS
API; the Browser Extension's background service worker and the Burp
Extension's JVM process have no access to the Desktop Agent's webview.
Some real network-addressable surface was mandatory, not a design
preference.

### TLS with a self-signed certificate instead of app-layer AES-GCM

Rejected as the default. A self-signed cert on `127.0.0.1` means a
Manifest V3 background service worker's `fetch()` either fails until
the OS/browser is made to trust the cert (a manual, unfamiliar step for
most users — "import this certificate" is a much scarier instruction
than "paste this token"), or the extension has to fall back to
`fetch` with certificate-error suppression, which browsers make
deliberately awkward for extensions to do safely. Given the transport
is already `127.0.0.1`-only (no network-path attacker to defend
against with TLS's usual guarantees), the actual remaining threat is
another local process reading the traffic — which token-keyed AES-GCM
defends against equally well, without the cert UX tax. TLS remains the
better choice if this bridge ever needs to accept non-loopback
connections (it explicitly does not, and is not expected to); revisit
if that ever changes.

### Encrypt the WebSocket too, uniformly with REST

Rejected for now. Live Sync's WS payloads are invalidation pings and
non-secret notifications only (see `bridge::live`'s doc comment) — no
capture payload, no finding content, no AI text ever crosses it. The
complexity of framing encrypted messages over a persistent WS
connection (nonce management per-frame, partial-frame buffering) wasn't
justified for data that carries no confidentiality requirement. It
stays bearer-token gated via a `?token=` query param (browsers can't
set WS handshake headers), which is sufficient given the low
sensitivity and the `127.0.0.1` bind.

### Montoya API for the Burp extension

Rejected for this implementation, reconsider later. Montoya is
Java/Kotlin-only, requiring a JDK + Gradle/Maven build — unavailable
and unverifiable in the sandbox this was built in, and a meaningfully
heavier install/dev story for contributors generally (a compile step
vs. drop-in `.py` files Burp interprets directly with Jython). The
legacy Extender API has been stable for roughly a decade, works
identically on Community and Professional, and covers everything
Module 8's Burp integration needs (context menus, HTTP listener, a
custom tab). If a future requirement needs a Montoya-only capability,
that's a scoped follow-up, not a reason to block this module.

### Full event-sourced or CRDT sync for Live Sync state

Rejected. `LiveSyncState` is small, ephemeral "what am I currently
looking at" UI context (current project/target/conversation/scan/
clipboard) — last-write-wins is the correct model for it, matching how
a single human moves between the desktop app, browser, and Burp one
action at a time rather than editing concurrently from multiple
surfaces. The WS ping + REST-refetch pattern (mirroring the Sync
Engine's push/pull split from ADR 0007) is simpler and sufficient.

## Consequences

**Positive**: the Desktop Agent gains a real, addressable API surface
without duplicating any Module 7 logic (one cloned `AppState`, reused
repositories); pairing is a one-time manual copy-paste with no
certificate ceremony; the encryption/auth model is uniform across two
very different client runtimes (a browser extension and a JVM/Jython
process) because the protocol was designed and cross-verified once and
implemented three times against the same spec; the sensitive-data
confirmation gate is genuinely defense-in-depth, not just a client-side
nicety, since the server independently refuses to persist an
unconfirmed sensitive capture.

**Negative / accepted trade-offs**: the Bridge Server is a new
long-running network listener the Desktop Agent didn't have before
(mitigated by the `127.0.0.1`-only bind — it is not reachable from the
network under any circumstance, and falls back to an OS-assigned
ephemeral port if the default is taken); token rotation is not
currently live — rotating requires an app restart, since `BridgeState`
holds an owned, not shared-mutable, crypto key (documented as a known
limitation in `bridge::mod::rotate_token`, acceptable because rotation
is a rare "I think this leaked" action, not a hot path); PATCH is
unreliable from `java.net.HttpURLConnection` without a reflection hack,
so the one PATCH-shaped route (`/api/findings/:id/status`) also accepts
POST — a small, documented wire-protocol wart rather than a client-side
hack; the Jython choice for Burp means this extension can't use any
Montoya-only capability if one becomes required later, and Jython's
crypto had to be hand-rolled against `javax.crypto`/`Mac` rather than
using a convenient high-level library, since Jython can't reliably load
CPython C-extension packages.

**Sequencing risk**: like ADR 0007's Phase 1-2 window, Module 8 ships
source-complete but unverified by a real compiler/browser/Burp
instance in this environment — the "Verification handoff" section in
`docs/modules/08-browser-extension.md` is the explicit bridge from
"written correctly by inspection and cross-language crypto testing" to
"confirmed working," and must be run before this ships.

## Verification performed in-sandbox (despite no toolchain)

Real, non-trivial verification was still possible without a compiler,
package manager, or browser:

1. **Cross-language HKDF-SHA256 + AES-256-GCM parity** — Python's
   `cryptography` library, a hand-rolled HMAC-based HKDF (matching the
   Rust and Jython logic), and the actual `shared/crypto.ts` (executed
   via `node --experimental-strip-types --experimental-transform-types`)
   all derived the identical 32-byte key for the same test token, and
   all round-tripped an AES-GCM envelope correctly. This is the
   highest-risk shared component (a mismatch would silently break every
   encrypted route for one client) and it checks out.
2. **Direct runtime execution of pure-logic TypeScript** —
   `shared/crypto.ts`, `shared/sensitivity.ts`, `shared/payloads.ts`,
   and `shared/export.ts` were run for real (not just read/reviewed)
   against the assertions in their corresponding `tests/*.test.ts`
   files, using Node's native TS execution flags as a substitute for a
   `vitest` run that repeatedly could not complete `npm install` within
   the sandbox's 45-second per-call limit.

## Bugs found and fixed during this module's implementation

1. `bridge::mod::build_router` initially applied `encrypt_layer`
   uniformly across the whole authenticated router, including
   `/api/ai/analyze` and `/api/ws`. Since the middleware buffers the
   full response body before encrypting, this would have silently
   turned real-time streaming into "block until done, deliver
   everything at once" — caught before shipping, fixed by splitting
   into the three router tiers described above.
2. `ai_analyze` originally created its conversation inside the spawned
   streaming task with no way to return the ID to the caller, meaning
   every AI message would start a fresh conversation. Fixed by creating
   the conversation synchronously first and returning it via an
   `X-Conversation-Id` response header.
3. `background/message-router.ts`'s capture handler originally
   hardcoded `preConfirmed: true` for every popup-triggered capture,
   which would have silently bypassed the sensitive-data confirmation
   gate entirely for that call path. Fixed to respect the caller's
   actual `confirmed` flag, with the popup/side panel doing a
   confirmed:false attempt first, catching `CONFIRMATION_REQUIRED`, and
   re-sending confirmed:true only after the user explicitly agrees.
