import 'dart:convert';

import 'package:uuid/uuid.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/connectivity_service.dart';
import '../../../core/storage/local_database.dart';
import '../../../core/sync/outbox_operation.dart';
import '../../../core/sync/sync_engine.dart';
import '../domain/project.dart';

/// Project Management (offline-first): reads prefer the network when
/// online (and mirror the response into sqflite for the next offline read);
/// writes made offline are applied optimistically to the local row and
/// queued into the sync outbox via [SyncEngine.enqueue] — see
/// `core/storage/local_database.dart`'s doc comment for the table shape
/// and `core/sync/sync_engine.dart` for the drain/reconcile contract this
/// repository's [ProjectSyncHandler] implements.
class ProjectRepository {
  ProjectRepository({
    required ApiClient apiClient,
    required LocalDatabase database,
    required ConnectivityService connectivity,
    required SyncEngine syncEngine,
  })  : _api = apiClient,
        _db = database,
        _connectivity = connectivity,
        _sync = syncEngine {
    _sync.registerHandler(_ProjectSyncHandler(this));
  }

  final ApiClient _api;
  final LocalDatabase _db;
  final ConnectivityService _connectivity;
  final SyncEngine _sync;

  Future<List<Project>> listProjects({ProjectStatus? status, bool favoritesOnly = false}) async {
    if (_connectivity.isOnline) {
      try {
        final projects = await _api.get<List<Project>>(
          '/projects',
          queryParameters: {
            if (status != null) 'status': status.wire,
            if (favoritesOnly) 'favoritesOnly': 'true',
          },
          decode: (json) =>
              (json as List<dynamic>).map((e) => Project.fromJson(e as Map<String, dynamic>)).toList(),
        );
        for (final p in projects) {
          await _cacheLocally(p);
        }
        return projects;
      } catch (_) {
        // fall through to local cache below.
      }
    }
    return _readLocal(status: status, favoritesOnly: favoritesOnly);
  }

  Future<List<Project>> _readLocal({ProjectStatus? status, bool favoritesOnly = false}) async {
    final where = <String>[];
    final args = <Object?>[];
    if (status != null) {
      where.add('status = ?');
      args.add(status.wire);
    }
    if (favoritesOnly) where.add('is_favorite = 1');
    final rows = await _db.raw.query(
      'projects',
      where: where.isEmpty ? null : where.join(' AND '),
      whereArgs: args.isEmpty ? null : args,
      orderBy: 'updated_at DESC',
    );
    return rows.map(Project.fromRow).toList();
  }

  Future<Project> getProject(String id) async {
    if (_connectivity.isOnline) {
      try {
        final project = await _api.get<Project>(
          '/projects/$id',
          decode: (json) => Project.fromJson(json as Map<String, dynamic>),
        );
        await _cacheLocally(project);
        return project;
      } catch (_) {
        // fall through
      }
    }
    final rows = await _db.raw.query('projects', where: 'id = ?', whereArgs: [id]);
    if (rows.isEmpty) {
      throw StateError('Project $id not found in cache and device is offline.');
    }
    return Project.fromRow(rows.first);
  }

  Future<Project> createProject({
    required String name,
    String? description,
    ProjectStatus status = ProjectStatus.active,
  }) async {
    if (_connectivity.isOnline) {
      final project = await _api.post<Project>(
        '/projects',
        body: {'name': name, 'description': description, 'status': status.wire},
        decode: (json) => Project.fromJson(json as Map<String, dynamic>),
      );
      await _cacheLocally(project);
      return project;
    }

    // Offline Editing: synthesize a local-only project with a client-
    // generated ID, queue a CREATE mutation, and reconcile the real
    // server ID in once connectivity returns (see _ProjectSyncHandler).
    final localId = 'local_${const Uuid().v4()}';
    final now = DateTime.now().toUtc();
    final project = Project(
      id: localId,
      workspaceId: '',
      name: name,
      description: description,
      status: status,
      visibility: 'WORKSPACE',
      isFavorite: false,
      tags: const [],
      createdAt: now,
      updatedAt: now,
    );
    await _cacheLocally(project, dirty: true);
    await _sync.enqueue(
      entityType: 'projects',
      entityId: localId,
      operation: OutboxOperation.create,
      payloadJson: jsonEncode({'name': name, 'description': description, 'status': status.wire}),
    );
    return project;
  }

  Future<Project> updateProject(
    String id, {
    String? name,
    String? description,
    ProjectStatus? status,
  }) async {
    final body = {
      if (name != null) 'name': name,
      if (description != null) 'description': description,
      if (status != null) 'status': status.wire,
    };
    if (_connectivity.isOnline && !id.startsWith('local_')) {
      final project = await _api.patch<Project>(
        '/projects/$id',
        body: body,
        decode: (json) => Project.fromJson(json as Map<String, dynamic>),
      );
      await _cacheLocally(project);
      return project;
    }
    final existing = await getProject(id);
    final merged = Project(
      id: existing.id,
      workspaceId: existing.workspaceId,
      name: name ?? existing.name,
      description: description ?? existing.description,
      status: status ?? existing.status,
      visibility: existing.visibility,
      isFavorite: existing.isFavorite,
      tags: existing.tags,
      createdAt: existing.createdAt,
      updatedAt: DateTime.now().toUtc(),
    );
    await _cacheLocally(merged, dirty: true);
    await _sync.enqueue(
      entityType: 'projects',
      entityId: id,
      operation: OutboxOperation.update,
      payloadJson: jsonEncode(body),
    );
    return merged;
  }

  Future<void> toggleFavorite(String id, bool favorite) async {
    if (_connectivity.isOnline) {
      if (favorite) {
        await _api.post<void>('/projects/$id/favorite');
      } else {
        await _api.delete<void>('/projects/$id/favorite');
      }
    }
    await _db.raw.update(
      'projects',
      {'is_favorite': favorite ? 1 : 0},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<void> archive(String id) async {
    if (_connectivity.isOnline) await _api.post<void>('/projects/$id/archive');
    await _db.raw.update('projects', {'status': 'ARCHIVED'}, where: 'id = ?', whereArgs: [id]);
  }

  Future<List<Project>> searchProjects(String query) async {
    final all = await listProjects();
    final lower = query.toLowerCase();
    return all.where((p) => p.name.toLowerCase().contains(lower)).toList();
  }

  Future<void> _cacheLocally(Project project, {bool dirty = false}) async {
    await _db.raw.insert(
      'projects',
      {
        'id': project.id,
        'workspace_id': project.workspaceId,
        'name': project.name,
        'description': project.description,
        'status': project.status.wire,
        'visibility': project.visibility,
        'is_favorite': project.isFavorite ? 1 : 0,
        'tags_json': jsonEncode(project.tags.map((t) => t.name).toList()),
        'created_at': project.createdAt.toIso8601String(),
        'updated_at': project.updatedAt.toIso8601String(),
        'is_dirty': dirty ? 1 : 0,
        'synced_at': dirty ? null : DateTime.now().toUtc().toIso8601String(),
      },
    );
    await _db.upsertSearchIndex(
      entityType: 'PROJECT',
      entityId: project.id,
      projectId: project.id,
      title: project.name,
      snippet: project.description,
    );
  }
}

class _ProjectSyncHandler implements SyncPushHandler {
  _ProjectSyncHandler(this._repo);
  final ProjectRepository _repo;

  @override
  String get entityType => 'projects';

  @override
  Future<void> push(OutboxEntry entry) async {
    final payload = jsonDecode(entry.payloadJson) as Map<String, dynamic>;
    switch (entry.operation) {
      case OutboxOperation.create:
        final project = await _repo._api.post<Project>(
          '/projects',
          body: payload,
          decode: (json) => Project.fromJson(json as Map<String, dynamic>),
        );
        // Replace the local_ placeholder row with the server's real ID.
        await _repo._db.raw.delete('projects', where: 'id = ?', whereArgs: [entry.entityId]);
        await _repo._cacheLocally(project);
      case OutboxOperation.update:
        if (entry.entityId.startsWith('local_')) return; // superseded by the create above.
        final project = await _repo._api.patch<Project>(
          '/projects/${entry.entityId}',
          body: payload,
          decode: (json) => Project.fromJson(json as Map<String, dynamic>),
        );
        await _repo._cacheLocally(project);
      case OutboxOperation.delete:
        await _repo._api.delete<void>('/projects/${entry.entityId}');
        await _repo._db.raw.delete('projects', where: 'id = ?', whereArgs: [entry.entityId]);
    }
  }

  @override
  Future<void> reconcile(String entityId) async {
    // push() already writes the reconciled server row for create/update;
    // nothing further needed for this entity type.
  }
}
