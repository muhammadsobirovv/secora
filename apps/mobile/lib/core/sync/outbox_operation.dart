/// The mutation types every offline-editable feature (Projects, Targets,
/// Findings, Notes, Evidence) queues into `outbox` when written while
/// offline. Kept generic (not one enum per entity) so `SyncEngine` has a
/// single drain loop instead of one per feature.
enum OutboxOperation { create, update, delete }

extension OutboxOperationCodec on OutboxOperation {
  String get wire => name.toUpperCase();

  static OutboxOperation fromWire(String value) => switch (value) {
        'CREATE' => OutboxOperation.create,
        'UPDATE' => OutboxOperation.update,
        'DELETE' => OutboxOperation.delete,
        _ => throw ArgumentError('Unknown outbox operation: $value'),
      };
}

/// One queued offline mutation. `entityType` matches the sqflite table name
/// it targets ('projects', 'targets', 'findings', 'notes', 'evidence'), so
/// `SyncEngine._applyEntry` can dispatch to the right repository's `push`
/// method by a simple switch instead of a type registry.
class OutboxEntry {
  const OutboxEntry({
    required this.id,
    required this.entityType,
    required this.entityId,
    required this.operation,
    required this.payloadJson,
    required this.createdAt,
    this.attemptCount = 0,
    this.lastError,
  });

  final String id;
  final String entityType;
  final String entityId;
  final OutboxOperation operation;
  final String payloadJson;
  final DateTime createdAt;
  final int attemptCount;
  final String? lastError;

  factory OutboxEntry.fromRow(Map<String, Object?> row) => OutboxEntry(
        id: row['id']! as String,
        entityType: row['entity_type']! as String,
        entityId: row['entity_id']! as String,
        operation: OutboxOperationCodec.fromWire(row['operation']! as String),
        payloadJson: row['payload_json']! as String,
        createdAt: DateTime.parse(row['created_at']! as String),
        attemptCount: row['attempt_count']! as int,
        lastError: row['last_error'] as String?,
      );

  Map<String, Object?> toRow() => {
        'id': id,
        'entity_type': entityType,
        'entity_id': entityId,
        'operation': operation.wire,
        'payload_json': payloadJson,
        'created_at': createdAt.toIso8601String(),
        'attempt_count': attemptCount,
        'last_error': lastError,
      };
}
