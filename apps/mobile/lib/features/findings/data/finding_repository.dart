import 'dart:convert';

import 'package:uuid/uuid.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/connectivity_service.dart';
import '../../../core/storage/local_database.dart';
import '../../../core/sync/outbox_operation.dart';
import '../../../core/sync/sync_engine.dart';
import '../domain/finding.dart';

/// Findings — `BUGBOUNTY_FINDING_ENDPOINTS` (bugbounty-endpoints.ts). Same
/// offline-first shape as Projects/Targets; stage transitions use the
/// dedicated `/bugbounty/findings/:id/stage` endpoint rather than a generic
/// PATCH, matching the backend's own state-machine validation boundary
/// (`BugBountyFindingStageService` — see ADR 0006).
class FindingRepository {
  FindingRepository({
    required ApiClient apiClient,
    required LocalDatabase database,
    required ConnectivityService connectivity,
    required SyncEngine syncEngine,
  })  : _api = apiClient,
        _db = database,
        _connectivity = connectivity,
        _sync = syncEngine {
    _sync.registerHandler(_FindingSyncHandler(this));
  }

  final ApiClient _api;
  final LocalDatabase _db;
  final ConnectivityService _connectivity;
  final SyncEngine _sync;

  Future<List<Finding>> listFindings({String? projectId, FindingSeverity? severity}) async {
    if (_connectivity.isOnline) {
      try {
        final findings = await _api.get<List<Finding>>(
          '/bugbounty/findings',
          queryParameters: {
            if (projectId != null) 'projectId': projectId,
            if (severity != null) 'severity': severity.wire,
          },
          decode: (json) =>
              (json as List<dynamic>).map((e) => Finding.fromJson(e as Map<String, dynamic>)).toList(),
        );
        for (final f in findings) {
          await _cacheLocally(f);
        }
        return findings;
      } catch (_) {
        // fall through
      }
    }
    final where = <String>[];
    final args = <Object?>[];
    if (projectId != null) {
      where.add('project_id = ?');
      args.add(projectId);
    }
    if (severity != null) {
      where.add('severity = ?');
      args.add(severity.wire);
    }
    final rows = await _db.raw.query(
      'findings',
      where: where.isEmpty ? null : where.join(' AND '),
      whereArgs: args.isEmpty ? null : args,
      orderBy: 'updated_at DESC',
    );
    return rows.map(Finding.fromRow).toList();
  }

  Future<Finding> getFinding(String id) async {
    if (_connectivity.isOnline) {
      try {
        final finding = await _api.get<Finding>(
          '/bugbounty/findings/$id',
          decode: (json) => Finding.fromJson(json as Map<String, dynamic>),
        );
        await _cacheLocally(finding);
        return finding;
      } catch (_) {
        // fall through
      }
    }
    final rows = await _db.raw.query('findings', where: 'id = ?', whereArgs: [id]);
    if (rows.isEmpty) throw StateError('Finding $id not cached and device is offline.');
    return Finding.fromRow(rows.first);
  }

  Future<Finding> createFinding({
    required String projectId,
    required String programId,
    required String title,
    required String description,
    required FindingSeverity severity,
    String? targetId,
  }) async {
    final body = {
      'projectId': projectId,
      'programId': programId,
      'title': title,
      'description': description,
      'severity': severity.wire,
      'targetId': targetId,
    };
    if (_connectivity.isOnline) {
      final finding = await _api.post<Finding>(
        '/bugbounty/findings',
        body: body,
        decode: (json) => Finding.fromJson(json as Map<String, dynamic>),
      );
      await _cacheLocally(finding);
      return finding;
    }
    final localId = 'local_${const Uuid().v4()}';
    final now = DateTime.now().toUtc();
    final finding = Finding(
      id: localId,
      workspaceId: '',
      projectId: projectId,
      programId: programId,
      targetId: targetId,
      title: title,
      description: description,
      severity: severity,
      stage: FindingStage.draft,
      createdAt: now,
      updatedAt: now,
    );
    await _cacheLocally(finding, dirty: true);
    await _sync.enqueue(
      entityType: 'findings',
      entityId: localId,
      operation: OutboxOperation.create,
      payloadJson: jsonEncode(body),
    );
    return finding;
  }

  Future<void> transitionStage(String id, FindingStage stage) async {
    if (_connectivity.isOnline && !id.startsWith('local_')) {
      await _api.post<void>('/bugbounty/findings/$id/stage', body: {'stage': stage.wire});
    }
    await _db.raw.update('findings', {'stage': stage.wire}, where: 'id = ?', whereArgs: [id]);
  }

  Future<void> _cacheLocally(Finding finding, {bool dirty = false}) async {
    await _db.raw.insert('findings', {
      'id': finding.id,
      'workspace_id': finding.workspaceId,
      'project_id': finding.projectId,
      'program_id': finding.programId,
      'target_id': finding.targetId,
      'title': finding.title,
      'description': finding.description,
      'severity': finding.severity.wire,
      'stage': finding.stage.wire,
      'cvss_score': finding.cvssScore,
      'cwe': finding.cwe,
      'raw_json': jsonEncode({'id': finding.id, 'title': finding.title}),
      'created_at': finding.createdAt.toIso8601String(),
      'updated_at': finding.updatedAt.toIso8601String(),
      'is_dirty': dirty ? 1 : 0,
      'synced_at': dirty ? null : DateTime.now().toUtc().toIso8601String(),
    });
    await _db.upsertSearchIndex(
      entityType: 'FINDING',
      entityId: finding.id,
      projectId: finding.projectId,
      title: finding.title,
      snippet: finding.description,
    );
  }
}

class _FindingSyncHandler implements SyncPushHandler {
  _FindingSyncHandler(this._repo);
  final FindingRepository _repo;

  @override
  String get entityType => 'findings';

  @override
  Future<void> push(OutboxEntry entry) async {
    if (entry.operation != OutboxOperation.create) return;
    final payload = jsonDecode(entry.payloadJson) as Map<String, dynamic>;
    final finding = await _repo._api.post<Finding>(
      '/bugbounty/findings',
      body: payload,
      decode: (json) => Finding.fromJson(json as Map<String, dynamic>),
    );
    await _repo._db.raw.delete('findings', where: 'id = ?', whereArgs: [entry.entityId]);
    await _repo._cacheLocally(finding);
  }

  @override
  Future<void> reconcile(String entityId) async {}
}
