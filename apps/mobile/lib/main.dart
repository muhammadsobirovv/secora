import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logging/logging.dart';

import 'app.dart';
import 'core/network/api_client.dart';
import 'core/network/connectivity_service.dart';
import 'core/providers/core_providers.dart';
import 'core/storage/hive_boxes.dart';
import 'core/storage/local_database.dart';
import 'core/storage/secure_token_storage.dart';
import 'core/sync/sync_engine.dart';
import 'features/auth/application/auth_notifier.dart';
import 'features/notifications/data/push_notification_service.dart';

/// Bootstraps every offline-first/core singleton before `runApp`, then
/// hands them to the widget tree via a single [ProviderContainer] passed
/// through `UncontrolledProviderScope` — see
/// `core/providers/core_providers.dart`'s doc comment for why these are
/// plain (not Future) providers.
///
/// [container] is declared `late` and captured by [apiClient]'s
/// `onSessionExpired` closure *before* being assigned: this is safe in Dart
/// because the closure only reads `container` when it actually runs (on a
/// 401-after-refresh-failure), by which point `container` has long since
/// been assigned below — the alternative (build the container first, then
/// try to construct `ApiClient` from it) is impossible, since `ApiClient`
/// itself must be one of the container's overrides.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  Logger.root.level = Level.INFO;
  Logger.root.onRecord.listen((record) {
    // ignore: avoid_print
    print('[${record.level.name}] ${record.loggerName}: ${record.message}');
  });

  await HiveBoxes.initialize();
  final localDatabase = await LocalDatabase.open();
  final tokenStorage = SecureTokenStorage();
  final connectivity = ConnectivityService();
  await connectivity.initialize();

  late final ProviderContainer container;

  final apiClient = ApiClient(
    tokenStorage: tokenStorage,
    connectivity: connectivity,
    onSessionExpired: () => container.read(authNotifierProvider.notifier).logout(),
  );

  final syncEngine = SyncEngine(database: localDatabase, connectivity: connectivity);

  container = ProviderContainer(
    overrides: [
      secureTokenStorageProvider.overrideWithValue(tokenStorage),
      connectivityServiceProvider.overrideWithValue(connectivity),
      localDatabaseProvider.overrideWithValue(localDatabase),
      apiClientProvider.overrideWithValue(apiClient),
      syncEngineProvider.overrideWithValue(syncEngine),
    ],
  );

  // Push Notifications (Notifications feature) — registers FCM + local
  // notification channels; safe to no-op on platforms/builds without
  // google-services.json configured yet (see that service's doc comment).
  await PushNotificationService.initializeBackgroundHandler();

  runApp(
    UncontrolledProviderScope(
      container: container,
      child: const PentestHubApp(),
    ),
  );
}
