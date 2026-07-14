# Module 5 Phase 2 Release Notes — AI Security Copilot (the "UX layer")

Full decision record: `docs/adr/0005-ai-security-copilot-module.md`
(Phase 2 decision section).

Approved immediately after Phase 1's verification/commit/push completed,
with the explicit condition that Module 5 still ends here — work stops
again pending a separate approval before Module 6 (Bug Bounty Workspace).

## Features added

**Backend** — a speech provider abstraction, mirroring Phase 1's AI
provider abstraction:

- **`SpeechProvider` interface** (`apps/api/src/modules/ai/speech/`):
  `transcribe()`, `synthesize()`, `isConfigured()`, and a `capabilities`
  list distinguishing "not configured" from "structurally can't do this"
  (ElevenLabs has no transcription API).
- **`AiSpeechProviderRegistryService`** — same constructor-injection +
  Map registry pattern as `AiProviderRegistryService`, exposed via
  `GET /ai/speech/providers`.
- **5 adapters**: `WEB_SPEECH` (a documented client-side marker, always
  "configured," never actually called server-side), `OPENAI_SPEECH`
  (Whisper transcription + TTS, reuses `AI_OPENAI_API_KEY`),
  `AZURE_SPEECH`, `GOOGLE_SPEECH`, `ELEVENLABS` (TTS-only) — the four
  cloud adapters are real `fetch()` clients, each unconfigured until keys
  are supplied, same posture as the five Phase 1 chat providers.
- New env keys (all optional): `AI_SPEECH_AZURE_API_KEY`,
  `AI_SPEECH_AZURE_REGION`, `AI_SPEECH_GOOGLE_API_KEY`,
  `AI_SPEECH_ELEVENLABS_API_KEY`, `AI_SPEECH_ELEVENLABS_VOICE_ID`.

**Frontend** — the six Phase 2 UX features, all on the existing `/ai`
dashboard:

- **Voice Interaction**: a mic button in the chat input
  (`useSpeechToText`, wrapping the browser's `SpeechRecognition`) appends
  recognized speech into the textarea for review before sending; a
  per-message Speak/Stop Speaking action (`useTextToSpeech`, wrapping
  `speechSynthesis`) reads assistant replies aloud. Both hide themselves
  on unsupported browsers (e.g. Firefox has no `SpeechRecognition`)
  rather than showing a broken control.
- **Smart Code Block toolbar**: every fenced code block in a message now
  shows its language, and gets Download (extension inferred from
  language), a line-wrap toggle, expand/collapse past 18 lines, and a
  Fullscreen dialog view — on top of the existing Copy button.
- **One-Click Code/Conversation Export**: a Download action on the code
  block toolbar and on each assistant message (saves that message's
  content as `.md`), plus a whole-conversation Export button in a new
  slim header bar above the message list (saves the full conversation as
  a Markdown transcript). All pure client-side Blob downloads — no new
  backend endpoint.
- **Terminal Mode**: a toggle in the same header bar (persisted to
  `localStorage`) switches the conversation into a monospace, black-
  background, prompt-prefixed presentation. Every existing feature
  (streaming, tool-activity badges, message actions) keeps working
  underneath.
- **Artifact Mode**: messages containing a substantial code block (≥12
  lines, `isArtifactWorthy()`) get an "Open in Artifact panel" action —
  a dedicated, resizable side panel (`AiArtifactPanel`) with its own
  Copy/Download/Close toolbar, decoupled from the cramped chat bubble.
- **Interactive Canvas**: a fenced ` ```mermaid ` block renders as a live,
  pannable (drag), zoomable (scroll wheel + buttons) SVG diagram
  (`MermaidDiagram`, using the new `mermaid` npm dependency) instead of
  plain text — useful for attack-chain or network-topology diagrams the
  model produces.

## Architectural improvements

- **`SpeechProvider` completes the "ships structurally complete, wired
  later" pattern** established by `AiProvider` in Phase 1 — a second
  capability class (voice, not chat) now follows the identical
  registry/adapter/unconfigured-until-keyed shape, reinforcing it as the
  house style for third-party AI integrations rather than a one-off.
- **`isArtifactWorthy()`/`extractPrimaryArtifact()`** are content
  heuristics, not tool-name allowlists — Artifact Mode triggers on any
  sufficiently long code block regardless of whether a tool produced it,
  keeping the frontend decoupled from the backend's specific tool
  roster.
- **Terminal Mode as a boolean prop, not a parallel component tree** —
  `AiChatMessage`/`AiChatInput` both accept `terminalMode` and branch
  their own rendering, so there is exactly one streaming/action
  implementation to maintain, not two.

## Breaking changes

None. Every addition is additive: new backend module (`ai/speech/`), new
optional env keys, new frontend components/hooks, one new npm dependency
(`mermaid`, frontend only). No Phase 1 endpoint, contract, or schema
column changed.

## Known limitations

- **No cloud speech provider is configured.** `OPENAI_SPEECH`,
  `AZURE_SPEECH`, `GOOGLE_SPEECH`, and `ELEVENLABS` will all report
  `configured: false` from `GET /ai/speech/providers` and throw
  `SpeechProviderNotConfiguredError` if ever invoked, until real keys are
  supplied — by design, matching Phase 1's AI-provider posture. Only the
  browser's own Web Speech API (`WEB_SPEECH`) is actually usable today.
- **Web Speech API browser support varies.** Chrome/Edge/Safari support
  `SpeechRecognition`; Firefox does not, as of this writing — the mic
  button and its degrade-gracefully behavior (`supported: false`) are the
  only accommodation; there's no cloud STT fallback wired in yet even
  though the backend adapters exist, since none are configured.
  `speechSynthesis` (used for Speak/Stop Speaking) has broader support.
- **Terminal Mode renders plain text, not Markdown** — code blocks,
  tables, and Mermaid diagrams inside a message lose their special
  rendering while terminal mode is on. Deliberate scope limit, not a bug.
- **Artifact Mode's heuristic is a simple line count** (≥12 lines in a
  fenced block) — it can both under-trigger (a short but important
  snippet) and over-trigger relative to what a human would call
  "artifact-worthy"; no user override to force-open a smaller block yet.
- **`mermaid` is a new, fairly large frontend dependency** — `pnpm
  install` must be run after pulling this change before `pnpm build`/
  `pnpm dev` will succeed in `apps/web`.
- Full `pnpm build`/`lint`/`check-types`/`test` verification for this
  module was run by the project owner outside this environment, same as
  Phase 1 — see the ADR's Consequences section and the commit history for
  the verification pass.

## Recommended next step

Per explicit instruction, work stops here pending approval. Module 5 (AI
Security Copilot) is now fully complete across both phases. The next
step on the existing rollout order (`PROJECT_SPEC.md`) is **Module 6 —
Bug Bounty Workspace**, once approved.
