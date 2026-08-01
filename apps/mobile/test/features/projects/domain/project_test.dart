import 'package:flutter_test/flutter_test.dart';
import 'package:pentesthub_mobile/features/projects/domain/project.dart';

void main() {
  group('ProjectStatusCodec', () {
    test('wire round-trips for every status', () {
      for (final status in ProjectStatus.values) {
        expect(ProjectStatusCodec.fromWire(status.wire), status);
      }
    });

    test('fromWire falls back to ACTIVE for an unrecognized value', () {
      expect(ProjectStatusCodec.fromWire('SOMETHING_NEW'), ProjectStatus.active);
    });
  });

  group('Project.fromJson', () {
    test('parses a full ProjectDto-shaped payload', () {
      final json = {
        'id': 'p1',
        'workspaceId': 'w1',
        'name': 'Acme Pentest',
        'description': 'Q1 engagement',
        'status': 'ON_HOLD',
        'visibility': 'WORKSPACE',
        'isFavorite': true,
        'tags': [
          {'id': 't1', 'name': 'web', 'color': '#ff0000'},
        ],
        'createdAt': '2026-01-01T00:00:00.000Z',
        'updatedAt': '2026-01-02T00:00:00.000Z',
      };

      final project = Project.fromJson(json);

      expect(project.id, 'p1');
      expect(project.name, 'Acme Pentest');
      expect(project.status, ProjectStatus.onHold);
      expect(project.isFavorite, isTrue);
      expect(project.tags, hasLength(1));
      expect(project.tags.first.name, 'web');
    });

    test('treats a null description as null, not a crash', () {
      final json = {
        'id': 'p1',
        'workspaceId': 'w1',
        'name': 'No description',
        'description': null,
        'status': 'ACTIVE',
        'visibility': 'PRIVATE',
        'isFavorite': false,
        'tags': <Map<String, dynamic>>[],
        'createdAt': '2026-01-01T00:00:00.000Z',
        'updatedAt': '2026-01-01T00:00:00.000Z',
      };

      expect(Project.fromJson(json).description, isNull);
    });
  });

  group('Project.fromRow / toJson round-trip via sqflite row shape', () {
    test('fromRow reconstructs a Project from the local_database schema', () {
      final row = {
        'id': 'p1',
        'workspace_id': 'w1',
        'name': 'Local project',
        'description': 'cached',
        'status': 'COMPLETED',
        'visibility': 'PUBLIC',
        'is_favorite': 1,
        'tags_json': '[]',
        'created_at': '2026-01-01T00:00:00.000Z',
        'updated_at': '2026-01-01T00:00:00.000Z',
      };

      final project = Project.fromRow(row);
      expect(project.status, ProjectStatus.completed);
      expect(project.isFavorite, isTrue);
    });
  });
}
