import 'dart:convert';

import 'package:uuid/uuid.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/connectivity_service.dart';
import '../../../core/storage/local_database.dart';
import '../../../core/sync/outbox_operation.dart';
import '../../../core/sync/sync_engine.dart';
import '../domain/target.dart';

/// Target Management — same offline-first read/write shape as
/// `ProjectRepository` (see that class's doc comment for the full
/// rationale); not re-explained here to avoid duplicating the same design
/// note across every offline-editable repository.
class TargetRepository {
  TargetRepository({
    required ApiClient apiClient,
    required LocalDatabase database,
    required ConnectivityService connectivity,
    required SyncEngine syncEngine,
  })  : _api = apiClient,
        _db = database,
        _connectivity = connectivity,
        _sync = syncEngine {
    _sync.registerHandler(_TargetSyncHandler(this));
  }

  final ApiClient _api;
  final LocalDatabase _db;
  final ConnectivityService _connectivity;
  final SyncEngine _sync;

  Future<List<Target>> listTargets(
    String projectId, {
    TargetType? type,
    TargetScopeStatus? scopeStatus,
  }) async {
    if (_connectivity.isOnline) {
      try {
        final targets = await _api.get<List<Target>>(
          '/projects/$projectId/targets',
          queryParameters: {
            if (type != null) 'type': type.wire,
            if (scopeStatus != null) 'scopeStatus': scopeStatus.wire,
          },
          decode: (json) =>
              (json as List<dynamic>).map((e) => Target.fromJson(e as Map<String, dynamic>)).toList(),
        );
        for (final t in targets) {
          await _cacheLocally(t);
        }
        return targets;
      } catch (_) {
        // fall through
      }
    }
    final rows = await _db.raw.query('targets', where: 'project_id = ?', whereArgs: [projectId]);
    return rows.map(Target.fromRow).toList();
  }

  Future<Target> createTarget(
    String projectId, {
    required TargetType type,
    required String value,
    String? name,
  }) async {
    final body = {'type': type.wire, 'value': value, 'name': name};
    if (_connectivity.isOnline) {
      final target = await _api.post<Target>(
        '/projects/$projectId/targets',
        body: body,
        decode: (json) => Target.fromJson(json as Map<String, dynamic>),
      );
      await _cacheLocally(target);
      return target;
    }
    final localId = 'local_${const Uuid().v4()}';
    final now = DateTime.now().toUtc();
    final target = Target(
      id: localId,
      projectId: projectId,
      type: type,
      value: value,
      name: name,
      environment: 'UNKNOWN',
      scopeStatus: TargetScopeStatus.pendingReview,
      createdAt: now,
      updatedAt: now,
    );
    await _cacheLocally(target, dirty: true);
    await _sync.enqueue(
      entityType: 'targets',
      entityId: localId,
      operation: OutboxOperation.create,
      payloadJson: jsonEncode({...body, '_projectId': projectId}),
    );
    return target;
  }

  Future<void> updateScopeStatus(String id, TargetScopeStatus status) async {
    if (_connectivity.isOnline && !id.startsWith('local_')) {
      await _api.patch<void>('/targets/$id', body: {'scopeStatus': status.wire});
    }
    await _db.raw.update('targets', {'scope_status': status.wire}, where: 'id = ?', whereArgs: [id]);
  }

  Future<void> deleteTarget(String id) async {
    if (_connectivity.isOnline && !id.startsWith('local_')) {
      await _api.delete<void>('/targets/$id');
    }
    await _db.raw.delete('targets', where: 'id = ?', whereArgs: [id]);
  }

  Future<void> _cacheLocally(Target target, {bool dirty = false}) async {
    await _db.raw.insert('targets', {
      'id': target.id,
      'project_id': target.projectId,
      'type': target.type.wire,
      'value': target.value,
      'name': target.name,
      'environment': target.environment,
      'scope_status': target.scopeStatus.wire,
      'tags_json': '[]',
      'created_at': target.createdAt.toIso8601String(),
      'updated_at': target.updatedAt.toIso8601String(),
      'is_dirty': dirty ? 1 : 0,
      'synced_at': dirty ? null : DateTime.now().toUtc().toIso8601String(),
    });
    await _db.upsertSearchIndex(
      entityType: 'TARGET',
      entityId: target.id,
      projectId: target.projectId,
      title: target.name ?? target.value,
      snippet: target.value,
    );
  }
}

class _TargetSyncHandler implements SyncPushHandler {
  _TargetSyncHandler(this._repo);
  final TargetRepository _repo;

  @override
  String get entityType => 'targets';

  @override
  Future<void> push(OutboxEntry entry) async {
    final payload = jsonDecode(entry.payloadJson) as Map<String, dynamic>;
    if (entry.operation == OutboxOperation.create) {
      final projectId = payload.remove('_projectId') as String;
      final target = await _repo._api.post<Target>(
        '/projects/$projectId/targets',
        body: payload,
        decode: (json) => Target.fromJson(json as Map<String, dynamic>),
      );
      await _repo._db.raw.delete('targets', where: 'id = ?', whereArgs: [entry.entityId]);
      await _repo._cacheLocally(target);
    }
  }

  @override
  Future<void> reconcile(String entityId) async {}
}
