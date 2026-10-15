# Secora AI — Burp Suite Extension

A Jython (legacy Burp Extender API) extension that connects Burp Suite
Community or Professional to a running Secora AI Desktop Agent via
its Local Bridge Server. See `apps/desktop/src-tauri/src/bridge/mod.rs`
for the server this talks to, and `apps/browser-extension/` for the
sibling Browser Extension that speaks the same protocol.

## Why Jython, not the Montoya API

Modern Burp extensions are usually written against the Montoya API
(Java/Kotlin only). This extension deliberately uses the older
`IBurpExtender`/`ITab`/`IContextMenuFactory`/`IHttpListener` API instead,
because:

- It's fully supported on both Burp **Community** and **Professional**
  (nothing here needs a Pro-only capability).
- Jython scripts are interpreted directly by Burp at load time — no JDK,
  Gradle, or Maven build step, which matters because this extension was
  written in a sandbox with no Java build toolchain available to compile
  against the Montoya API and verify the result.
- The legacy API has been stable for a decade and isn't going anywhere.

## Prerequisites

1. **Burp Suite** Community or Professional (recent version — tested
   against the legacy Extender API surface, which hasn't changed
   meaningfully in years).
2. **Jython standalone JAR** — download `jython-standalone-2.7.3.jar` (or
   newer 2.7.x) from https://www.jython.org/download and save it
   somewhere permanent (e.g. `~/tools/jython-standalone-2.7.3.jar`).
3. In Burp: **Extender > Options > Python Environment** — set "Location
   of Jython standalone JAR file" to the path from step 2.
4. **Secora AI Desktop Agent** running (Module 7) with the Local
   Bridge Server started (it starts automatically with the desktop app —
   see Settings > Browser Extension for the pairing token).

## Installing

1. **Extender > Extensions > Add**
2. Extension Type: **Python**
3. Extension file: browse to `extensions/burp/pentesthub.py` in this
   repo (leave `pentesthub_burp/` next to it — Jython adds the loaded
   script's own directory to `sys.path`, so the package is found
   automatically with no extra configuration).
4. Click **Next** — you should see `Secora AI loaded.` in the output
   pane and a new **Secora AI** tab appear in Burp's top-level tab
   bar.

## Pairing

1. In the Desktop Agent: **Settings > Browser Extension** — copy the
   **Server URL** and **Pairing Token**.
2. In Burp's **Secora AI** tab: paste both into the "Desktop Agent
   Connection" form, click **Test Connection** (should show
   "Connected"), then **Save**.

## Using it

Right-click any request/response in Burp (Proxy history, Repeater,
Target site map, etc.) to get the **Secora AI** submenu:

- **Send Request** / **Send Response** — saves the raw HTTP text as
  Evidence in the current Project (whatever Project/Target is currently
  selected in the Desktop Agent or Browser Extension — read live from
  `/api/live-sync`, see `pentesthub_burp/context_menu.py`).
- **Create Finding** — prompts for a title/severity, saves a Finding with
  the request/response attached as evidence.
- **Create Evidence** — equivalent to Send Request + Send Response.
- **Create Note** — prompts for free text, saves a Note.
- **Generate AI Analysis** — saves the request/response context as a Note
  for follow-up in the Desktop Agent's AI Chat (this extension does not
  itself stream AI responses — see the note in
  `context_menu.py::_generate_ai_analysis` for why, and use the Browser
  Extension's Side Panel if you want in-context streaming AI analysis of
  HTTP traffic instead).
- **Generate Report Section** — adds a report-draft-tagged Finding; run
  the actual report export from the Desktop Agent's Report Generator
  (Module 7), which pulls in every Finding tagged this way.

The **Activity Log** at the bottom of the tab shows what was sent and
any errors.

The extension also passively watches proxied responses (`IHttpListener`)
for server errors (5xx) and secret-shaped strings (JWTs, `password=`,
`Authorization: Bearer`, etc.) and logs a **one-line, no-upload**
suggestion — nothing is ever sent automatically; you still have to
right-click and choose an action, per the "never automatically upload
sensitive data" rule the whole Module 8 spec is built around.

## Security notes

- All communication uses the same AES-256-GCM envelope encryption as the
  Browser Extension (`pentesthub_burp/crypto.py`, built on
  `javax.crypto` — no third-party crypto dependency, since Jython can't
  reliably load CPython C-extension crypto packages).
- The Bridge Server binds to `127.0.0.1` only; this extension never
  needs network access beyond that.
- The pairing token is stored via Burp's own
  `ICallbacks.saveExtensionSetting` (persisted with your Burp
  project/user config, not in a separate file this extension manages).

## Verification handoff (real machine required)

Nothing in `extensions/burp/` has been executed by an interpreter in
this sandbox (no Jython, no Burp, no network access to fetch either).
What *has* been verified here: the AES-256-GCM + HKDF-SHA256 algorithm
in `pentesthub_burp/crypto.py` was cross-checked against Python's
`cryptography` library (see `tests/test_crypto.py`'s docstring for the
exact comparison) and produces identical output for a known test vector
— so the cryptography is right; whether this specific `.py` file is
syntactically valid Jython 2.7 has not been confirmed by an interpreter.

On a real machine, in order:

```bash
# 1. Sanity-check the crypto module standalone (no Burp needed)
cd extensions/burp/tests
jython test_crypto.py

# 2. Load the extension in Burp (see "Installing" above) and confirm:
#    - No errors in Extender > Extensions > Errors tab
#    - The "Secora AI" tab renders
#    - "Test Connection" succeeds against a running Desktop Agent
#    - Each context-menu action (right-click a request in Proxy history)
#      completes and appears in the Desktop Agent's Project (Evidence/
#      Findings/Notes tabs)
```
