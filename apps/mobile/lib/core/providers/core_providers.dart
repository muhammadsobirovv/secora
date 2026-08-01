import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../network/api_client.dart';
import '../network/connectivity_service.dart';
import '../storage/local_database.dart';
import '../storage/secure_token_storage.dart';
import '../sync/sync_engine.dart';

/// Root-level singletons, overridden once in `main.dart` after the async
/// bootstrap (Hive.initFlutter, sqflite open, etc.) completes — every other
/// provider in `features/*` depends on these instead of constructing its
/// own Dio/Hive/sqflite instance, so there is exactly one of each for the
/// app's lifetime.
///
/// Declared as plain `Provider`s that throw `UnimplementedError` until
/// overridden (see `main.dart`'s `ProviderScope(overrides: [...])`) rather
/// than `FutureProvider`s wrapping the async init, so every downstream
/// provider can depend on them synchronously — the async bootstrap happens
/// once, before `runApp`, not on every provider read.

final secureTokenStorageProvider = Provider<SecureTokenStorage>(
  (ref) => throw UnimplementedError('Overridden in main.dart bootstrap'),
);

final connectivityServiceProvider = Provider<ConnectivityService>(
  (ref) => throw UnimplementedError('Overridden in main.dart bootstrap'),
);

final localDatabaseProvider = Provider<LocalDatabase>(
  (ref) => throw UnimplementedError('Overridden in main.dart bootstrap'),
);

final apiClientProvider = Provider<ApiClient>(
  (ref) => throw UnimplementedError('Overridden in main.dart bootstrap'),
);

final syncEngineProvider = Provider<SyncEngine>(
  (ref) => throw UnimplementedError('Overridden in main.dart bootstrap'),
);

/// True once the app has completed its offline-first bootstrap
/// (Hive + sqflite + secure storage ready) — gates the splash screen.
final appBootstrappedProvider = StateProvider<bool>((ref) => false);
