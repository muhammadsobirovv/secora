# Module 12 — Cross-Platform Mobile Application (Flutter)

Decision record: `docs/adr/0012-mobile-application.md`. Release notes:
`docs/releases/module-12-release-notes.md`.

## 1. Project scaffold

`apps/mobile/pubspec.yaml` — Flutter 3.22+/Dart 3.4+, Riverpod, GoRouter,
Freezed/json_serializable/riverpod_generator (declared, not yet used —
see ADR 0012 §2), Dio, Hive, sqflite, flutter_secure_storage, local_auth,
image_picker/camera/file_picker/mobile_scanner/record, speech_to_text/
flutter_tts, flutter_markdown/flutter_highlight/webview_flutter, fl_chart,
firebase_messaging/flutter_local_notifications, workmanager,
flutter_jailbreak_detection, and supporting utilities (uuid, crypto,
connectivity_plus, share_plus, open_filex, device_info_plus,
package_info_plus, permission_handler, cached_network_image,
shared_preferences). `analysis_options.yaml` extends `flutter_lints` with
a stricter rule set (`avoid_dynamic_calls`, `cancel_subscriptions`,
`unawaited_futures`, etc.).

`lib/` layout: `core/` (config, network, storage, sync, theme, router,
error, security — cross-cutting, no feature imports), `features/<domain>/
{domain,data,application,presentation}` (one folder per backend module
boundary), `main.dart` (bootstrap), `app.dart` (MaterialApp.router shell +
lifecycle-driven PIN re-lock + jailbreak warning banner).

## 2. Core — networking, storage, theme, error handling

- `core/config/env.dart` — compile-time `API_BASE_URL` via `--dart-define`,
  mirroring apps/web's `NEXT_PUBLIC_API_URL` convention.
- `core/error/{app_exception,result}.dart` — `AppException` mirrors
  `AppErrorCode` (packages/shared/src/errors.ts) as an open string rather
  than a hand-copied 150+-literal enum (that set grows every module); a
  hand-rolled `Result<T>` sealed class replaces a full FP library for the
  one place this app needs Either-shaped repository returns.
- `core/network/api_client.dart` — Dio + `_AuthInterceptor` (bearer
  attach, coalesced refresh-on-401, single retry), envelope unwrapping,
  offline short-circuit (`AppException.offline()` when
  `requiresConnectivity` and the device is offline).
- `core/network/sse_client.dart` — manual SSE over `ResponseType.stream`
  (ADR 0012 §4).
- `core/network/certificate_pinning.dart` — SHA-256 SPKI pinning via
  `IOHttpClientAdapter.createHttpClient`'s `badCertificateCallback`,
  configured via `--dart-define=CERT_PINS=...`, no-op (not "pin against
  nothing") when unset.
- `core/storage/{secure_token_storage,hive_boxes,local_database}.dart` —
  see ADR 0012 §5 for the Hive/sqflite split; `local_database.dart` also
  owns the FTS5 `search_index` table and the `outbox` table.
- `core/sync/{outbox_operation,sync_engine}.dart` — see ADR 0012 §6.
- `core/theme/{app_colors,app_theme}.dart` — dark/light `ThemeData` pair
  matching apps/web's Tailwind/shadcn dark-slate-plus-indigo palette and
  the project-wide severity color scale.
- `core/router/{app_routes,app_router,app_shell}.dart` — GoRouter with a
  `StatefulShellRoute.indexedStack` five-tab shell (Dashboard/Projects/
  Findings/Copilot/Settings) plus top-level detail routes on the root
  navigator; `redirect` is driven by `AuthState` via a `ChangeNotifier`
  bridging `ref.listen(authNotifierProvider)`.

## 3. Auth (Module 1 integration)

`features/auth/{domain,data,application,presentation}` — email login,
register, MFA challenge, forgot/reset password, change password, OAuth
(Google/GitHub via an in-app WebView intercepting the backend's own
`/auth/oauth/:provider/callback` redirect — no separate native OAuth SDK
per provider), session list + revoke + "sign out of all other devices",
device registration (a stable per-install UUID stamped into secure
storage), PIN lock + biometrics (`DeviceLockService`, ADR 0012 §7) with a
dedicated lock screen and Settings > Security setup screen. `AuthNotifier`
(`Notifier<AuthState>`) owns cold-start token validation, login/MFA/OAuth
completion, PIN/biometric unlock, and re-locking on app-background (wired
in `app.dart`'s `WidgetsBindingObserver`).

## 4. Dashboard

Workspace overview stats (`/bugbounty/dashboard`), pinned/favorite
projects, latest findings, recent activity (`/activity`), and Quick
Actions (Ask AI / Capture / Findings / Search). Recon/Scanner job widgets
and a standalone AI Suggestions widget are deferred — no mobile
repository was built this pass for recon/scanner job status or an AI
suggestions endpoint.

## 5. Project / Target management

`ProjectRepository`/`TargetRepository` — full offline-first read/write
(network-first read with sqflite mirror; offline write applies optimistic
local rows with client-generated `local_`-prefixed IDs, queues a
`SyncPushHandler`-driven mutation, and the handler swaps the placeholder
row for the server's real row on reconnect). Create/update/archive/
favorite/search all implemented; project members and tag editing UI
deferred (tags render read-only).

## 6. Findings

`FindingRepository` — browse/filter by severity, create, stage transition
via the dedicated `/bugbounty/findings/:id/stage` endpoint (not a generic
PATCH, matching the backend's own state-machine boundary), offline create.
Comments/attachments/timeline UI deferred — no client wiring for those
sub-resources yet.

## 7. Reports

`ReportRepository` — list/get/AI-draft-generate/export/download-to-local/
share. Preview renders the report body as Markdown; native PDF/DOCX
rendering is out of scope because the backend itself has no PDF renderer
either (`ExportBugReportResultDto`'s own doc comment: "PDF" export is
HTML content mislabeled, by design, for the client to convert).

## 8. AI Security Copilot (Module 11 integration)

`features/ai_chat` — streaming chat over `SseClient`, Markdown rendering
(`flutter_markdown` + a custom code-block builder), syntax highlighting
(`flutter_highlight`), Mermaid diagrams (a WebView loading mermaid.js from
CDN per fenced ` ```mermaid ` block), voice input (push-to-talk via
`features/voice`). `features/agent` — Master Orchestrator run start/list/
live task-tree via SSE (`AgentRunNotifier` accumulates
`OrchestrationStreamEvent`s into a task map + activity log)/cancel/
Explainability (`explainRun` rendered as a bottom sheet). `Knowledge Base`
search screen. Conversation branching, bookmarks/pinned-conversations
list UI, and full Artifact side-panel mode are deferred — the repository
methods exist (`AiChatRepository.bookmarkMessage`,
`pinConversation`) but have no dedicated screen yet.

## 9. Voice

`features/voice/data/voice_service.dart` wraps `speech_to_text` (on-device
STT) and `flutter_tts` — Push-to-Talk is wired into the AI chat composer;
Hands-Free/Read-Aloud are Settings toggles whose state is defined but not
yet consumed by an auto-listen/auto-speak loop in the chat screen. Voice
Commands (parsing spoken text into app navigation) and a "read this report
aloud" button are deferred.

## 10. Notifications

`NotificationRepository` (in-app inbox, `/bugbounty/notifications`) +
`PushNotificationService` (FCM registration scaffold + local notification
channel setup, safely no-op without a configured Firebase project — see
that file's doc comment). Desktop Sync Notifications relay and per-kind
deep-linking are deferred.

## 11. Evidence capture

`EvidenceRepository` — capture always writes to sqflite first
(Offline Queue), computes SHA-256 over the local file before any upload
(`crypto` package, computed once, on-device, never recomputed
server-side), then uploads immediately if online or on the next
`flushUploadQueue()` call. `EvidenceCaptureScreen` covers Camera/Gallery/
File Picker (also serving as the Screen Capture Import path, since no
cross-platform "grab last screenshot" API exists)/Video/Microphone
recording/QR scanner (`mobile_scanner`). Document Scanner is a plain
camera capture (no edge-detection/crop library added).

## 12. File manager

Scoped to the on-device documents cache (`reports/`, evidence) rather than
a server-side file tree — the backend has no standalone file-tree API
(attachments are per-entity: `AttachableType`/`AttachmentDto`). Browse/
preview (`open_filex`)/rename/delete/search implemented; folder structure
beyond the two fixed subfolders and a dedicated Favorites list are
deferred.

## 13. Global search

`GlobalSearchRepository` — online hits `/search`
(Projects/Targets/Notes/Evidence, per `SearchResultDto`); offline falls
back to the local FTS5 `search_index` table every offline repository's
`_cacheLocally` keeps current. Reports/AI Conversations/Payloads/
Knowledge Base each have their own dedicated search UI on their own
screen rather than being unified into this one.

## 14. Offline mode

The architecture's default posture, not a bolt-on — see ADR 0012 §6 and
`core/sync/sync_engine.dart`. Conflict resolution is last-write-wins with
a `SyncConflict` event stream defined for future UI surfacing (no banner
widget consumes it yet). Background Sync triggers on connectivity-restored
(`ConnectivityService.onStatusChange`) and on evidence upload-queue
flush; a periodic `workmanager` background task is declared as a
dependency but not yet registered — the connectivity-triggered path
covers the spec's Background Sync requirement without it for now.

## 15. Settings

Theme (light/dark/system, Hive-persisted), Security (PIN/biometric setup,
sessions, remote logout), AI Providers (Module 11 Privacy Mode: CLOUD/
LOCAL/HYBRID via `/ai/privacy-mode`), Voice toggles, Storage/Downloads
(File Manager link + on-device usage size), Sync status (pending outbox
count), Developer Mode (API base URL display, gated by
`Env.developerModeAvailable`). Language is device-default only — no
in-app locale switcher or l10n message catalog was added this pass.

## 16. Workspace, Analytics

`WorkspaceRepository` — info + read-only member/role list + usage stats
reusing the Dashboard summary endpoint. `AnalyticsScreen` — Severity
Distribution (pie) and Projects-by-status (bar) via `fl_chart`, computed
client-side from data already fetched elsewhere. Risk Score/Recon
Progress/Scanner Progress/Activity Timeline charts are deferred (no
mobile repository exists yet for recon/scanner job status or a
risk-scoring endpoint).

## 17. Real-time

SSE only (chat + orchestration-run streaming) — there is no separate
WebSocket layer in this backend to integrate with. Automatic refresh is
pull-to-refresh + provider invalidation on writes. Presence/typing
indicators are out of scope: no presence system exists anywhere in
Modules 1–11's backend, mobile or otherwise.

## 18. Security hardening

Encrypted local storage (`flutter_secure_storage`, Android
EncryptedSharedPreferences / iOS Keychain), certificate pinning, a
single owned API client, jailbreak/root detection
(`flutter_jailbreak_detection`, surfaced as a dismissible warning banner —
fail-open by design, see that service's doc comment on why a hard block
is the wrong trade-off), clipboard auto-clear utility
(`core/security/clipboard_guard.dart`) for the few call sites that copy
genuinely sensitive values, session timeout (PIN/biometric re-lock on
background), remote logout (revoke-all-other-sessions). Screenshot
Protection — marked "(optional)" in the spec — is documented as a
release-build native platform configuration (Android `FLAG_SECURE` / iOS
an overlay view) rather than implemented as a Dart-level runtime toggle;
no plugin was added for it this pass.

## 19. Performance

`ListView.builder` throughout (no eagerly-built full lists),
`cached_network_image` for bounded-memory image caching, evidence/report
downloads as discrete async operations off the widget build path.
Cursor-based pagination (the backend's `ActivityEvent.cursor` field
exists for exactly this) and a background-download progress UI are
deferred — current screens load one full result set per call, acceptable
at this project's data volumes today.

## 20. Accessibility

Built on standard Material widgets throughout (Text/ListTile/
ElevatedButton/Chip) rather than raw `GestureDetector`/`Container`, which
carries default Semantics, system text-scale respect, and RTL
`Directionality` support for free — a deliberate choice made from the
start, not a retrofit. Explicit `tooltip`s were added to icon-only buttons
that lacked one (password visibility, notifications bell, voice mic).
High Contrast has no dedicated theme variant (relies on OS-level
accessibility settings); Keyboard Navigation is Flutter's default focus
traversal, not custom-tuned.

## 21. Testing

`test/core/error/result_test.dart`, `test/core/sync/
outbox_operation_test.dart`, `test/features/projects/domain/
project_test.dart`, `test/features/findings/domain/finding_test.dart`,
`test/features/auth/domain/auth_state_test.dart` (unit); `test/features/
findings/presentation/widgets/severity_badge_test.dart`, `test/core/
theme/app_theme_test.dart` (widget). Integration, golden, offline, sync,
and performance test suites — the spec's other five categories — are not
written this pass; they need a running app/emulator or a golden-image
baseline, neither of which exists in this sandbox, and would need
substantial mock/fake infrastructure (a fake `ApiClient`, an in-memory
sqflite) to be meaningful even with a working toolchain. Flagged as a
follow-up, not silently dropped.

## 22. CI/CD

`.github/workflows/mobile-ci.yml` — analyze, test, Android APK+AAB build,
iOS `--no-codesign` build on a `macos-latest` runner (validates the iOS
build configuration without needing real signing credentials in CI).
`android/fastlane/Fastfile` + `ios/fastlane/Fastfile` — verify/build/
beta-upload lanes, both requiring secrets (`PLAY_JSON_KEY_FILE` /
`match`+Apple Developer credentials) this pass cannot generate.
`AndroidManifest.xml` permissions and iOS `Info.plist` usage-description
strings were hand-authored to cover every plugin actually used
(camera/mic/biometrics/notifications/photo-library). None of this was
executed — see §23.

## 23. Verification

- **No Flutter/Dart toolchain was available in this sandbox at any point**
  (see ADR 0012 §8): `storage.googleapis.com`, where Flutter's engine/
  Dart-SDK binaries are fetched from on first run, returned `403
  blocked-by-allowlist`, even though `github.com` itself was reachable —
  so even a from-source Flutter SDK clone would not have produced a
  runnable `flutter` binary. `flutter analyze`, `flutter test`,
  `flutter build apk`, and `flutter build ios --no-codesign` (this task's
  four hard commit gates) were **not run**.
- Every `.dart` file was hand-authored and then manually re-read against:
  (a) the real `packages/shared` DTO shapes (read directly from
  `auth.ts`/`projects.ts`/`targets.ts`/`bugbounty.ts`/`ai.ts`/`agent.ts`/
  the corresponding `*-endpoints.ts` files — not assumed), (b) Riverpod
  2.x's `Notifier`/`FamilyNotifier`/`NotifierProvider.family` API shapes
  and GoRouter 14's `StatefulShellRoute.indexedStack` API shape (from
  training-time knowledge, since pub.dev/API docs were also unreachable —
  see §8), and (c) internal consistency across files (import paths,
  provider names, route constants).
- **One real bug was caught this way**: `AnalyticsScreen`'s bar-chart data
  mapping wrote `entry.value.value.value.toDouble()` — one `.value` too
  many for the actual `Map<int, MapEntry<ProjectStatus,int>>.entries`
  shape produced by `.asMap().entries` — fixed to `entry.value.value`
  during the same pass, before it was ever left in place. A second, purely
  cosmetic bug (a malformed `Color(0xFF12172233;` hex literal missing its
  closing paren) was also caught and fixed immediately after being
  written, in `core/theme/app_colors.dart`.
- **`android/` and `ios/` native project directories are hand-authored
  partials, not full `flutter create` scaffolds.** `AndroidManifest.xml`
  and `Info.plist` were written because they're commonly hand-edited even
  in real projects; Gradle build files (`build.gradle`, `settings.gradle`)
  and the Xcode `.pbxproj`/workspace files were **not** hand-authored —
  generating those correctly requires `flutter create
  --platforms=android,ios .` on a real machine with a working Flutter
  SDK, which is the necessary first setup step before this module's CI
  workflow can run at all. This is disclosed here and in
  `docs/mobile/flutter-development-guide.md`, not silently assumed away.
- iOS IPA generation is additionally impossible on any Linux sandbox
  regardless of network access — Xcode requires macOS. This is a hard
  platform constraint, not a sandbox-specific one; the CI workflow's
  `ios-build` job targets a `macos-latest` GitHub-hosted runner for
  exactly this reason.

## 24. Documentation

`docs/adr/0012-mobile-application.md`, this file, `docs/releases/
module-12-release-notes.md`, `docs/mobile/mobile-architecture-guide.md`,
`docs/mobile/flutter-development-guide.md`, `docs/mobile/
api-integration-guide.md`, `PROJECT_SPEC.md` (Module 12 entry appended),
`README.md` (Module 12 list entry + `apps/mobile` added to the monorepo
layout section).

## 25. Commit

Handed off via GitHub Desktop (this sandbox's `git commit` cannot
complete within its tool-call time limit for this repository — the same
FUSE-mount I/O degradation disclosed in Module 11's own verification
section, confirmed to still apply). See the release notes for the exact
commit message used.
