# Module 12 Release Notes — Cross-Platform Mobile Application (Flutter)

Full decision record: `docs/adr/0012-mobile-application.md`.
Implementation record: `docs/modules/12-mobile-application.md`.

## Features added

**`apps/mobile`** — a new Flutter app (Clean Architecture, feature-first,
Riverpod, GoRouter, Dio, Hive + sqflite) joining `apps/web` and
`apps/desktop` as a third first-class client of `apps/api`.

**Auth** — full Module 1 integration: email login/register, MFA challenge,
Google/GitHub OAuth (in-app WebView), password reset, refresh-token
rotation, session management + remote logout, device registration, PIN
lock + Face ID/Fingerprint (a device-unlock gate layered on top of an
already-valid session, not a second server-side factor), secure token
storage (platform keychain).

**Dashboard** — workspace stats, pinned projects, latest findings, recent
activity, quick actions.

**Projects / Targets / Findings** — full offline-first CRUD (create,
update, archive/favorite, stage transitions) with a shared
`SyncEngine`/outbox pattern: writes made offline apply optimistically to a
local sqflite row and queue a mutation that a per-entity
`SyncPushHandler` pushes on reconnect, swapping the client-generated
placeholder ID for the server's real one.

**Reports** — view/AI-draft-generate/export/download/share, Markdown
preview.

**AI Security Copilot** — streaming chat (manual SSE, matching apps/web's
own non-`EventSource` approach) with Markdown, syntax-highlighted code
blocks, and Mermaid diagram rendering; voice push-to-talk; Master
Orchestrator run start/live task-tree/cancel/Explainability; Knowledge
Base search.

**Voice** — on-device speech-to-text (`speech_to_text`) and text-to-speech
(`flutter_tts`), wired into the AI chat composer.

**Notifications** — in-app inbox + FCM/local-notification registration
scaffold.

**Evidence capture** — camera/gallery/file picker/video/microphone/QR
scanner, on-device SHA-256 hashing before upload, an offline upload
queue.

**File manager** — local documents cache (downloaded reports + evidence)
with browse/preview/rename/delete/search.

**Global search** — online `/search` + an offline FTS5 fallback over the
same locally-cached entities.

**Settings** — theme, security (PIN/biometric/sessions), AI Providers
(Module 11 Privacy Mode), voice toggles, storage/sync status, developer
mode.

**Workspace, Analytics** — read-only workspace/member info + usage stats;
severity-distribution and projects-by-status charts (`fl_chart`).

**Security hardening** — encrypted local storage, certificate pinning,
jailbreak/root detection (dismissible warning, fail-open by design),
clipboard auto-clear utility, session timeout, remote logout.

**CI/CD** — `.github/workflows/mobile-ci.yml` (analyze/test/Android
APK+AAB/iOS no-codesign build) + Fastlane lanes for both platforms.

## Bugs found and fixed

- **A data-mapping typo in `AnalyticsScreen`'s bar chart**:
  `entry.value.value.value.toDouble()` had one `.value` too many for the
  actual `.asMap().entries` shape it was reading — caught during the same
  authoring pass via careful manual type-tracing (no compiler available
  to catch it automatically) and fixed to `entry.value.value`.
- **A malformed hex color literal** (`Color(0xFF12172233;`, missing its
  closing paren and with two extra digits) in `core/theme/app_colors.dart`
  — caught immediately after writing it and fixed to `Color(0xFF121722)`.
- **A `ProviderContainer` double-construction bug** in the original draft
  of `main.dart`'s bootstrap: `ApiClient`'s `onSessionExpired` callback
  needs to read from the same container the widget tree uses, but the
  container itself needs `ApiClient` as one of its overrides — an
  initial draft built a throwaway container just to satisfy the callback,
  then built a second, real container the widget tree actually used,
  meaning the callback would have called `logout()` on an already-disposed
  container in production. Fixed by declaring `late final
  ProviderContainer container;` and having the closure capture that
  variable by reference (safe in Dart, since the closure only reads it
  when actually invoked, long after assignment).

## Known limitations

- **No Flutter/Dart toolchain was reachable in this sandbox at all** — the
  network allowlist blocks `storage.googleapis.com` (where Flutter's
  engine/Dart-SDK binaries are fetched from), so `flutter analyze`/
  `flutter test`/`flutter build` never ran. Every source file was
  hand-authored and manually cross-referenced against real
  `packages/shared` contracts instead of compiler-verified — see ADR 0012
  §8 and the module doc's Verification section (§23) for the full account
  and the two bugs that manual review did catch.
- **`android/`/`ios/` are hand-authored partials, not full `flutter
  create` scaffolds** — `AndroidManifest.xml`/`Info.plist` exist;
  Gradle/Xcode project files do not, and must be generated on a real dev
  machine via `flutter create --platforms=android,ios .` before this
  module builds at all.
- **iOS IPA generation is categorically impossible outside macOS+Xcode**,
  independent of sandbox — the CI workflow's `ios-build` job targets a
  `macos-latest` GitHub-hosted runner for this reason and is itself
  unexecuted/unverified.
- **Deferred within several features** (each disclosed in the relevant
  task's completion note and the module doc's per-section write-up):
  finding comments/attachments/timeline UI; Recon/Scanner job dashboard
  widgets and their Analytics charts; DOCX/native-PDF in-app report
  preview; AI chat conversation branching UI and a dedicated bookmarks/
  pinned-conversations screen; Document Scanner edge-detection/crop;
  in-app language switcher; screenshot protection as a runtime toggle;
  cursor-based pagination; a background `workmanager` periodic sync task
  (connectivity-triggered sync covers the spec's Background Sync
  requirement without it, for now).
- **Integration, golden, offline, sync, and performance test suites** (5
  of the spec's 7 testing categories) are not written this pass — see
  module doc §21 for why (need a running app/emulator or golden-image
  baselines, neither available here).

## Testing

New Dart test files under `apps/mobile/test/`: `core/error/result_test.dart`,
`core/sync/outbox_operation_test.dart`, `core/theme/app_theme_test.dart`,
`features/projects/domain/project_test.dart`, `features/findings/domain/
finding_test.dart`, `features/auth/domain/auth_state_test.dart`,
`features/findings/presentation/widgets/severity_badge_test.dart` — unit
and widget tests covering codec round-trips, JSON/row parsing, and
exhaustive sealed-class matching. **Not executed** (no Flutter SDK this
session — see Known limitations).

**Before merging, on a real machine with Flutter installed, run from
`apps/mobile`:**
`flutter create --platforms=android,ios .` (first time only) →
`flutter pub get` → `flutter analyze --fatal-infos` → `flutter test` →
`flutter build apk --release` → `flutter build ios --release --no-codesign`
