import 'package:flutter_test/flutter_test.dart';
import 'package:pentesthub_mobile/core/sync/outbox_operation.dart';

void main() {
  group('OutboxOperationCodec', () {
    test('wire round-trips for every operation', () {
      for (final op in OutboxOperation.values) {
        expect(OutboxOperationCodec.fromWire(op.wire), op);
      }
    });

    test('fromWire throws on an unknown value', () {
      expect(() => OutboxOperationCodec.fromWire('NOT_A_REAL_OP'), throwsArgumentError);
    });
  });

  group('OutboxEntry', () {
    test('toRow/fromRow round-trip preserves every field', () {
      final entry = OutboxEntry(
        id: 'entry-1',
        entityType: 'projects',
        entityId: 'proj-1',
        operation: OutboxOperation.update,
        payloadJson: '{"name":"Test"}',
        createdAt: DateTime.utc(2026, 1, 1, 12),
        attemptCount: 2,
        lastError: 'timeout',
      );

      final restored = OutboxEntry.fromRow(entry.toRow());

      expect(restored.id, entry.id);
      expect(restored.entityType, entry.entityType);
      expect(restored.entityId, entry.entityId);
      expect(restored.operation, entry.operation);
      expect(restored.payloadJson, entry.payloadJson);
      expect(restored.createdAt, entry.createdAt);
      expect(restored.attemptCount, entry.attemptCount);
      expect(restored.lastError, entry.lastError);
    });

    test('fromRow tolerates a null lastError', () {
      final row = {
        'id': 'entry-2',
        'entity_type': 'targets',
        'entity_id': 'target-1',
        'operation': 'CREATE',
        'payload_json': '{}',
        'created_at': DateTime.utc(2026).toIso8601String(),
        'attempt_count': 0,
        'last_error': null,
      };
      final entry = OutboxEntry.fromRow(row);
      expect(entry.lastError, isNull);
      expect(entry.operation, OutboxOperation.create);
    });
  });
}
