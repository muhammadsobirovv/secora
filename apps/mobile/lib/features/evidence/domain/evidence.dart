enum EvidenceType { screenshot, httpRequest, httpResponse, file, log, video, payload, command }

extension EvidenceTypeCodec on EvidenceType {
  String get wire => switch (this) {
        EvidenceType.httpRequest => 'HTTP_REQUEST',
        EvidenceType.httpResponse => 'HTTP_RESPONSE',
        _ => name.toUpperCase(),
      };
}

enum EvidenceUploadStatus { pending, uploading, uploaded, failed }

/// Mirrors packages/shared's `EvidenceDto` (evidence.ts) plus mobile-only
/// upload-queue fields (`localFilePath`/`uploadStatus`) that never leave the
/// device (not part of the server DTO).
class Evidence {
  const Evidence({
    required this.id,
    required this.projectId,
    required this.type,
    required this.title,
    required this.uploadStatus,
    this.targetId,
    this.description,
    this.textContent,
    this.checksum,
    this.localFilePath,
  });

  final String id;
  final String projectId;
  final String? targetId;
  final EvidenceType type;
  final String title;
  final String? description;
  final String? textContent;
  final String? checksum;
  final String? localFilePath;
  final EvidenceUploadStatus uploadStatus;

  factory Evidence.fromRow(Map<String, Object?> row) => Evidence(
        id: row['id']! as String,
        projectId: row['project_id']! as String,
        targetId: row['target_id'] as String?,
        type: EvidenceType.values.firstWhere(
          (t) => t.wire == row['type'],
          orElse: () => EvidenceType.file,
        ),
        title: row['title']! as String,
        description: row['description'] as String?,
        textContent: row['text_content'] as String?,
        checksum: row['checksum'] as String?,
        localFilePath: row['local_file_path'] as String?,
        uploadStatus: EvidenceUploadStatus.values.firstWhere(
          (s) => s.name.toUpperCase() == row['upload_status'],
          orElse: () => EvidenceUploadStatus.pending,
        ),
      );
}
