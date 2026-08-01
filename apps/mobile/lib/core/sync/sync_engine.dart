import 'dart:async';

import 'package:logging/logging.dart';
import 'package:uuid/uuid.dart';

import '../network/connectivity_service.dart';
import '../storage/local_database.dart';
import 'outbox_operation.dart';

final _log = Logger('SyncEngine');

/// A feature's push side of the sync contract — one implementation per
/// offline-editable entity type ('projects', 'targets', 'findings',
/// 'notes', 'evidence'), registered into [SyncEngine.registerHandler] from
/// each feature's DI setup (see `features/*/data/*_sync_handler.dart`).
/// Keeps `core/sync` entity-agnostic so it never imports a `features/*`
/// repository directly (Clean Architecture: core has no feature deps).
abstract class SyncPushHandler {
  String get entityType;

  /// Sends one queued mutation to the backend. Throwing here leaves the
  /// entry in the outbox for the next drain pass (with attemptCount
  /// incremented); returning normally deletes it.
  Future<void> push(OutboxEntry entry);

  /// Pulls the authoritative server copy of [entityId] after a successful
  /// push, so the local sqflite row's `synced_at`/fields reflect the
  /// server's write (e.g. server-computed fields, `updatedAt`) rather than
  /// staying frozen at the optimistic local value.
  Future<void> reconcile(String entityId);
}

/// Drains `outbox` whenever connectivity returns, in FIFO order per entity
/// (oldest mutation for a given `entityId` first, so a create always lands
/// before a later update/delete for the same row). Conflict resolution is
/// last-write-wins by comparing the outbox entry's `createdAt` against the
/// server row's `updatedAt` at reconcile time — a queued local edit that is
/// older than the server's current version is still pushed (the user's
/// intent was captured while offline and shouldn't be silently dropped),
/// but [SyncConflict] events are emitted so the UI can surface a
/// "this was also changed on the server" banner rather than pretending the
/// merge was clean.
class SyncEngine {
  SyncEngine({
    required LocalDatabase database,
    required ConnectivityService connectivity,
  })  : _database = database,
        _connectivity = connectivity {
    _connectivitySub = _connectivity.onStatusChange.listen((online) {
      if (online) unawaited(drain());
    });
  }

  final LocalDatabase _database;
  final ConnectivityService _connectivity;
  late final StreamSubscription<bool> _connectivitySub;
  final Map<String, SyncPushHandler> _handlers = {};
  final _conflictController = StreamController<SyncConflict>.broadcast();
  final _statusController = StreamController<SyncStatus>.broadcast();

  bool _draining = false;
  static const int _maxAttempts = 8;

  Stream<SyncConflict> get onConflict => _conflictController.stream;
  Stream<SyncStatus> get onStatusChange => _statusController.stream;

  void registerHandler(SyncPushHandler handler) {
    _handlers[handler.entityType] = handler;
  }

  Future<void> enqueue({
    required String entityType,
    required String entityId,
    required OutboxOperation operation,
    required String payloadJson,
  }) async {
    final entry = OutboxEntry(
      id: const Uuid().v4(),
      entityType: entityType,
      entityId: entityId,
      operation: operation,
      payloadJson: payloadJson,
      createdAt: DateTime.now().toUtc(),
    );
    await _database.raw.insert('outbox', entry.toRow());
    if (_connectivity.isOnline) unawaited(drain());
  }

  Future<int> get pendingCount async {
    final rows = await _database.raw.rawQuery('SELECT COUNT(*) AS c FROM outbox');
    return (rows.first['c'] as int?) ?? 0;
  }

  Future<void> drain() async {
    if (_draining || !_connectivity.isOnline) return;
    _draining = true;
    _statusController.add(SyncStatus.syncing);
    try {
      final rows = await _database.raw.query('outbox', orderBy: 'created_at ASC');
      for (final row in rows) {
        final entry = OutboxEntry.fromRow(row);
        if (entry.attemptCount >= _maxAttempts) continue; // giving up — surfaced in Settings > Sync.
        final handler = _handlers[entry.entityType];
        if (handler == null) {
          _log.warning('No sync handler registered for ${entry.entityType}');
          continue;
        }
        try {
          await handler.push(entry);
          await handler.reconcile(entry.entityId);
          await _database.raw.delete('outbox', where: 'id = ?', whereArgs: [entry.id]);
        } catch (e) {
          _log.warning('Sync push failed for ${entry.entityType}/${entry.entityId}: $e');
          await _database.raw.update(
            'outbox',
            {'attempt_count': entry.attemptCount + 1, 'last_error': e.toString()},
            where: 'id = ?',
            whereArgs: [entry.id],
          );
        }
      }
      _statusController.add(SyncStatus.idle);
    } finally {
      _draining = false;
    }
  }

  void reportConflict(SyncConflict conflict) => _conflictController.add(conflict);

  Future<void> dispose() async {
    await _connectivitySub.cancel();
    await _conflictController.close();
    await _statusController.close();
  }
}

enum SyncStatus { idle, syncing, error }

class SyncConflict {
  const SyncConflict({
    required this.entityType,
    required this.entityId,
    required this.localUpdatedAt,
    required this.serverUpdatedAt,
  });

  final String entityType;
  final String entityId;
  final DateTime localUpdatedAt;
  final DateTime serverUpdatedAt;
}
