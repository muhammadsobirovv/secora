# Mobile Architecture Guide

`apps/mobile` — Flutter, Clean Architecture, feature-first. Companion to
`docs/adr/0012-mobile-application.md` (the decisions) and
`docs/modules/12-mobile-application.md` (the per-subsystem record); this
guide is the "how do I find/add things" reference for day-to-day work.

## Layer boundaries

```
lib/
  core/           # cross-cutting, zero feature imports
    config/       # Env
    error/        # AppException, Result<T>
    network/      # ApiClient, SseClient, ConnectivityService, cert pinning
    storage/      # SecureTokenStorage, HiveBoxes, LocalDatabase (sqflite)
    sync/         # SyncEngine, OutboxEntry/OutboxOperation
    security/     # ClipboardGuard
    theme/        # AppColors, AppTheme
    router/       # AppRoutes, AppRouter, AppShell
    providers/    # core_providers.dart — root singletons
  features/<domain>/
    domain/       # plain immutable models, no Flutter/Dio/Riverpod imports
    data/         # repositories — the only layer that touches ApiClient/
                   # LocalDatabase/SseClient directly
    application/  # Riverpod providers/Notifiers — orchestrate data+domain
    presentation/
      screens/
      widgets/
  main.dart       # bootstrap: Hive/sqflite/secure-storage init, ProviderContainer
  app.dart         # MaterialApp.router shell, lifecycle-driven PIN re-lock
```

A `data/` repository never imports another feature's `data/` — cross-
feature composition happens in `application/` (e.g. `DashboardScreen`
reads `projectRepositoryProvider` and `findingRepositoryProvider`
side-by-side, but `ProjectRepository` never imports `FindingRepository`).
`core/` never imports `features/*` — `ApiClient.onSessionExpired` and
`SyncEngine`'s `SyncPushHandler` interface are the two places a feature
plugs into core via a callback/interface instead of core reaching up into
a feature.

## Why plain sealed classes instead of Freezed for state unions

`AuthState`, `Result<T>`, `ChatStreamEvent`, `OrchestrationEvent` are all
plain Dart 3 `sealed class` hierarchies matched with `switch` expressions,
not `@freezed` unions. `pubspec.yaml` still declares `freezed`/
`json_serializable`/`riverpod_generator` — this project intends to adopt
them — but this pass could not run `dart run build_runner build` (no
Flutter SDK in the authoring sandbox; see ADR 0012 §8), and hand-writing
`@freezed`-annotated source with no compiler to catch a mismatched
generated-code shape is a correctness risk with no way to verify it. Dart
3's native sealed classes give exhaustive-switch safety with zero codegen,
so every state union in this pass uses that instead. **When a real dev
machine picks this up**: adopting `@freezed` for these is a mechanical,
low-risk refactor (the shapes are already right) — do it, don't feel
obligated to keep the hand-written version.

## Offline-first pattern (Projects/Targets/Findings)

Every offline-editable repository follows the same shape — read
`project_repository.dart` first if you're adding a new one:

1. **Read**: if online, hit the network, mirror the response into the
   matching sqflite table (`_cacheLocally`), return it. If offline (or the
   network call throws), read the sqflite table directly.
2. **Write while online**: call the endpoint, cache the response.
3. **Write while offline**: synthesize a `local_<uuid>` row, write it to
   sqflite with `is_dirty=1`, call `SyncEngine.enqueue(...)`, return the
   local row immediately (optimistic).
4. **Sync**: implement `SyncPushHandler` (`entityType`, `push(entry)`,
   `reconcile(entityId)`), register it in the repository's constructor via
   `syncEngine.registerHandler(this)`. `push` for a `create` operation
   calls the real endpoint and **replaces** the `local_` row with the
   server's row (delete + re-insert under the new ID) — every other
   provider reading that entity should re-fetch/invalidate after a sync
   pass completes (`SyncEngine.onStatusChange`).

`EvidenceRepository` does not use the JSON outbox — binary uploads don't
fit that shape — it has its own `upload_status` column
(`PENDING`/`UPLOADING`/`UPLOADED`/`FAILED`) and a `flushUploadQueue()`
method called from the same connectivity-restored hook.

## Adding a new feature

1. `lib/features/<name>/domain/<model>.dart` — plain class,
   `fromJson`/`toJson`/`fromRow` as needed. Match the real
   `packages/shared` DTO field names exactly (read the `.ts` file, don't
   guess).
2. `lib/features/<name>/data/<name>_repository.dart` — constructor takes
   `ApiClient` (+ `LocalDatabase`/`ConnectivityService`/`SyncEngine` if
   offline-editable). Every method returns/throws via `ApiClient`'s
   envelope handling — never touch `Dio` directly outside `core/network`.
3. `lib/features/<name>/application/<name>_providers.dart` — a `Provider`
   for the repository (reading from `core_providers.dart`'s singletons),
   plus `FutureProvider`/`Notifier` providers for screen state.
4. `lib/features/<name>/presentation/screens/*.dart` — `ConsumerWidget`/
   `ConsumerStatefulWidget`, read providers via `ref.watch`.
5. Add the route to `core/router/app_routes.dart` (a constant, not a
   string literal at the call site) and wire it in `app_router.dart`.

## Known gaps (see release notes for the full list)

Recon/Scanner job status, a risk-scoring endpoint, and conversation
branching/bookmarks screens have no repository/UI yet — the backend
endpoints may or may not already exist; check `packages/shared` before
assuming a new backend endpoint is needed.
