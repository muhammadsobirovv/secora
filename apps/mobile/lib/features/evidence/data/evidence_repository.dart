import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:uuid/uuid.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/connectivity_service.dart';
import '../../../core/storage/local_database.dart';
import '../domain/evidence.dart';

/// Evidence Capture — `EVIDENCE_ENDPOINTS` (workspace-foundation-endpoints.ts)
/// for the metadata row, plus `attachments(id)` for the actual file upload
/// (multipart, matching `AttachmentDto`'s contract). Every capture is
/// written to the local Offline Queue table first — the metadata row and,
/// for file-backed evidence, the SHA-256 checksum are computed and stored
/// entirely offline, then `flushUploadQueue()` (called from
/// `core/sync/sync_engine.dart`'s connectivity-restored hook) uploads
/// whatever's still `PENDING`/`FAILED`.
class EvidenceRepository {
  EvidenceRepository({
    required ApiClient apiClient,
    required LocalDatabase database,
    required ConnectivityService connectivity,
  })  : _api = apiClient,
        _db = database,
        _connectivity = connectivity;

  final ApiClient _api;
  final LocalDatabase _db;
  final ConnectivityService _connectivity;

  Future<List<Evidence>> listForProject(String projectId) async {
    final rows = await _db.raw.query('evidence', where: 'project_id = ?', whereArgs: [projectId]);
    return rows.map(Evidence.fromRow).toList();
  }

  /// Captures one evidence item — always writes locally first (Offline
  /// Queue), then attempts an immediate upload if online. [filePath] is
  /// null for text-only evidence (an HTTP request/response paste, a
  /// command log); when present, its SHA-256 is computed via
  /// [_hashFile] before upload, matching the spec's "SHA-256 Hash"
  /// requirement — the hash is computed once, locally, and never
  /// recomputed server-side, so it's provably the hash of exactly the
  /// bytes captured on-device.
  Future<Evidence> capture({
    required String projectId,
    required EvidenceType type,
    required String title,
    String? targetId,
    String? description,
    String? textContent,
    String? filePath,
  }) async {
    final id = const Uuid().v4();
    final checksum = filePath != null ? await _hashFile(filePath) : null;

    await _db.raw.insert('evidence', {
      'id': id,
      'project_id': projectId,
      'target_id': targetId,
      'type': type.wire,
      'title': title,
      'description': description,
      'text_content': textContent,
      'checksum': checksum,
      'local_file_path': filePath,
      'upload_status': 'PENDING',
      'created_at': DateTime.now().toUtc().toIso8601String(),
      'updated_at': DateTime.now().toUtc().toIso8601String(),
      'is_dirty': 1,
      'synced_at': null,
    });
    await _db.upsertSearchIndex(
      entityType: 'EVIDENCE',
      entityId: id,
      projectId: projectId,
      title: title,
      snippet: description ?? textContent,
    );

    if (_connectivity.isOnline) {
      await _uploadOne(id);
    }
    final row = await _db.raw.query('evidence', where: 'id = ?', whereArgs: [id]);
    return Evidence.fromRow(row.first);
  }

  Future<String> _hashFile(String path) async {
    final bytes = await File(path).readAsBytes();
    return sha256.convert(bytes).toString();
  }

  /// Drains every `PENDING`/`FAILED` evidence row — called on app resume
  /// and whenever `ConnectivityService` reports the device came back
  /// online (wired in `main.dart`'s bootstrap alongside `SyncEngine`).
  Future<void> flushUploadQueue() async {
    if (!_connectivity.isOnline) return;
    final rows = await _db.raw.query(
      'evidence',
      where: "upload_status IN ('PENDING','FAILED')",
    );
    for (final row in rows) {
      await _uploadOne(row['id']! as String);
    }
  }

  Future<void> _uploadOne(String id) async {
    final rows = await _db.raw.query('evidence', where: 'id = ?', whereArgs: [id]);
    if (rows.isEmpty) return;
    final evidence = Evidence.fromRow(rows.first);

    await _db.raw.update('evidence', {'upload_status': 'UPLOADING'}, where: 'id = ?', whereArgs: [id]);
    try {
      final created = await _api.post<Map<String, dynamic>>(
        '/projects/${evidence.projectId}/evidence',
        body: {
          'type': evidence.type.wire,
          'title': evidence.title,
          'description': evidence.description,
          'textContent': evidence.textContent,
          'targetId': evidence.targetId,
        },
        decode: (json) => json as Map<String, dynamic>,
      );
      final serverId = created['id'] as String;

      if (evidence.localFilePath != null) {
        final form = FormData.fromMap({
          'file': await MultipartFile.fromFile(evidence.localFilePath!),
          'checksum': evidence.checksum,
        });
        await _api.raw.post<void>('/evidence/$serverId/attachments', data: form);
      }

      await _db.raw.delete('evidence', where: 'id = ?', whereArgs: [id]);
      await _db.raw.insert('evidence', {
        ...jsonDecode(jsonEncode(rows.first)) as Map<String, dynamic>,
        'id': serverId,
        'upload_status': 'UPLOADED',
        'is_dirty': 0,
        'synced_at': DateTime.now().toUtc().toIso8601String(),
      });
    } catch (_) {
      await _db.raw.update('evidence', {'upload_status': 'FAILED'}, where: 'id = ?', whereArgs: [id]);
    }
  }
}
