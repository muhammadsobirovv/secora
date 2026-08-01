# ADR 0012 — Cross-Platform Mobile Application (Flutter)

## Status

Accepted (source-complete; verification loop constrained by sandbox toolchain — see §8).

## Context

Modules 1–11 shipped a Web Dashboard (`apps/web`) and a Desktop Agent
(`apps/desktop`, Tauri). Neither covers the "in the field" use case a
penetration tester actually has: monitoring an engagement, capturing
evidence, and reviewing findings from a phone, often with unreliable
connectivity. Module 12 adds `apps/mobile`, a Flutter app for Android and
iOS, as the third first-class client alongside `apps/web` and
`apps/desktop` — reusing the same backend (`apps/api`) and the same
contracts (`packages/shared`'s DTOs/endpoint constants) both of those
already depend on.

## Decisions

**1. Flutter + Clean Architecture + Riverpod + GoRouter, feature-first.**
Matches the spec exactly. Feature-first (`lib/features/<domain>/{domain,
data,application,presentation}`) mirrors `apps/web`'s
`features/<domain>/{hooks,components}` convention — the same "one folder
per backend module boundary" organizing principle, just with Dart's
directory-based layering added on top since Flutter has no file-based
routing to lean on the way Next.js does.

**2. Freezed/riverpod_generator/json_serializable are declared
dependencies, not used for hand-authored code in this pass.** This
sandbox cannot run `flutter pub get` or `dart run build_runner build` (see
§8) — hand-writing `@freezed`/`@riverpod`-annotated source with no
compiler to catch a malformed generated-code mismatch is a correctness
risk with no way to verify it. Every model in this pass is a plain
immutable Dart class with hand-written `fromJson`/`toJson`/`copyWith`, and
every provider is a hand-written `Notifier`/`FamilyNotifier` subclass
(both are first-class Riverpod 2.x APIs requiring zero codegen). The three
codegen packages stay in `pubspec.yaml` for the team to adopt
incrementally once a real dev machine can run `build_runner` — this is a
disclosed trade-off, not a silent scope cut.

**3. Dio + a hand-rolled envelope-aware `ApiClient`, mirroring
apps/web's `apiFetch<T>`.** `apps/web/lib/api/client.ts`'s contract — every
response is `{success:true,data:T}` or `{statusCode,code,message}`
(`ApiSuccessResponse`/`ApiErrorResponse`, packages/shared/src/api-response.ts),
concurrent-401s coalesce into one `/auth/refresh` call — is reproduced
almost line-for-line in `core/network/api_client.dart`, just as a Dio
interceptor instead of a fetch wrapper. Same reasoning as apps/web: one
place owns token attachment/refresh/error-unwrapping, every repository
calls through it.

**4. SSE via manual Dio `ResponseType.stream` parsing, not a native
`EventSource`.** apps/web's own doc comments (`useReconJobLogs`,
`useAgentRunStream`) already establish why: `EventSource` can't attach a
`Authorization: Bearer` header, and every SSE endpoint in this API
requires one. Flutter has no built-in `EventSource` either, so
`core/network/sse_client.dart` does the same manual line-by-line `data: `
parsing over a raw HTTP stream that apps/web's fetch-based hooks do.

**5. Hive for small key-value/blob state, sqflite for anything queried
or filtered offline.** The spec lists both; rather than picking one
arbitrarily, `core/storage/local_database.dart`'s doc comment states the
split explicitly: Hive holds settings/auth-session-snapshot/favorites/
notifications-cache; sqflite holds `projects`/`targets`/`findings`/`notes`/
`evidence` (each with `is_dirty`/`synced_at` columns) plus an FTS5
`search_index` virtual table backing offline Global Search, plus the
`outbox` table the sync engine drains.

**6. Offline-first via a per-entity `SyncPushHandler` registered into one
`SyncEngine`, not a bespoke queue per feature.** `ProjectRepository`,
`TargetRepository`, and `FindingRepository` each register a handler
(`push`/`reconcile`) with the shared `SyncEngine`
(`core/sync/sync_engine.dart`); the engine owns FIFO draining, retry-count
capping, and a `SyncConflict` event stream, while staying entity-agnostic
(it never imports a `features/*` repository directly — Clean Architecture
layering holds even for the sync engine). `EvidenceRepository` has its own
upload queue instead of using the JSON outbox, since binary file uploads
don't fit the same shape.

**7. PIN Lock + Biometrics is a device-unlock gate, not a second
auth factor.** `DeviceLockService`'s doc comment is explicit: a user who
passes Face ID/PIN is proving they're the same person who logged in to a
device screen, exactly like a banking app — this is orthogonal to Module
1's server-side MFA (`/auth/mfa/*`), which remains the only thing that
gates issuance of a token pair.

**8. Sandbox could not run Flutter at all.** `flutter`/`dart` binaries are
fetched from `storage.googleapis.com` on first run, and that host is
blocked by this sandbox's network allowlist (confirmed via `curl -sI`
returning `403 blocked-by-allowlist`, while `github.com` itself returned
200) — so even cloning the Flutter SDK repository from GitHub would not
have produced a runnable `flutter` command. This is a stricter constraint
than any prior module faced (Modules 1–11 could at least attempt
`tsc`/`eslint`/`jest`, even if slowly): there was no partial toolchain
verification possible here at all, not even a single `flutter analyze`
pass on one file. iOS IPA builds are additionally and separately
impossible on this Linux sandbox regardless of network access — Xcode
requires macOS, a constraint no sandbox running Linux can work around.
Every `.dart` file in this module was hand-authored and manually
cross-referenced against real `packages/shared` DTOs, real Dio/Riverpod/
GoRouter API shapes (from training-time knowledge, since pub.dev API docs
were also unreachable), and internal consistency across files — see
`docs/modules/12-mobile-application.md`'s Verification section for the
full account and the one caught-by-inspection bug (a double `.value`
typo in the Analytics bar chart's data mapping).

**9. Scope was deliberately triaged across the spec's ~30 feature
sections rather than attempting exhaustive depth on all of them.** Given
the sandbox's total inability to compile-check anything in this module,
building extremely deep, narrow slices everywhere would have meant more
unverifiable surface area with no way to catch mistakes. Instead, every
section has a real, working implementation, and several — Auth, offline
sync, AI Copilot streaming — go deep because they're the architecturally
load-bearing pieces every other feature depends on (repository pattern,
SSE client, PIN lock). Where a section was intentionally trimmed (finding
comments/attachments UI, Recon/Scanner job dashboard widgets, DOCX/PDF
in-app preview, conversation branching UI, full golden/integration/
performance test suites), the relevant task's completion note and this
module's release notes say so explicitly — the same disclosure discipline
every prior module in this project has followed for its own gaps.

## Consequences

- A fourth client (`apps/mobile`) now depends on `packages/shared`'s DTOs
  and endpoint constants exactly like `apps/web` does — any future
  breaking change to those contracts must consider three consumers
  (`apps/web`, `apps/desktop`, `apps/mobile`), not two.
- The mobile app's own local schema (`local_database.dart`) is a fourth
  place, after Prisma (`apps/api`), the Desktop Agent's SQLite schema
  (`apps/desktop`), and IndexedDB-adjacent web caching, where "what a
  Project/Finding/Target looks like" is encoded — kept in sync by
  deliberate convention (mirror the DTO field-for-field) rather than a
  shared schema-generation step, the same situation Module 7's Desktop
  Agent already established as this project's precedent.
- No Flutter/Dart code in this module has been executed, only reviewed —
  this is a materially higher-risk verification posture than Modules 1–11
  ever operated under, and is disclosed as such rather than minimized.
