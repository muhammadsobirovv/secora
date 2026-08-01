import 'package:flutter_test/flutter_test.dart';
import 'package:pentesthub_mobile/features/findings/domain/finding.dart';

void main() {
  group('FindingSeverityCodec', () {
    test('wire round-trips for every severity', () {
      for (final s in FindingSeverity.values) {
        expect(FindingSeverityCodec.fromWire(s.wire), s);
      }
    });

    test('unrecognized value falls back to info', () {
      expect(FindingSeverityCodec.fromWire('NOPE'), FindingSeverity.info);
    });
  });

  group('FindingStageCodec', () {
    test('wire round-trips for every stage, including the two irregular ones', () {
      for (final stage in FindingStage.values) {
        expect(FindingStageCodec.fromWire(stage.wire), stage);
      }
    });

    test('new_ encodes as NEW, not NEW_', () {
      expect(FindingStage.new_.wire, 'NEW');
    });

    test('needMoreInfo encodes as NEED_MORE_INFO', () {
      expect(FindingStage.needMoreInfo.wire, 'NEED_MORE_INFO');
    });

    test('label reads naturally for a snake_case-derived stage', () {
      expect(FindingStage.needMoreInfo.label, 'Need more info');
      expect(FindingStage.new_.label, 'New');
      expect(FindingStage.resolved.label, 'Resolved');
    });
  });

  group('Finding.fromJson', () {
    test('parses a BugBountyFindingDto-shaped payload', () {
      final json = {
        'id': 'f1',
        'workspaceId': 'w1',
        'projectId': 'p1',
        'programId': 'prog1',
        'targetId': null,
        'title': 'Reflected XSS',
        'description': 'Found in search box',
        'severity': 'HIGH',
        'stage': 'TRIAGED',
        'cvssScore': 7.4,
        'cwe': 'CWE-79',
        'createdAt': '2026-01-01T00:00:00.000Z',
        'updatedAt': '2026-01-01T00:00:00.000Z',
      };

      final finding = Finding.fromJson(json);

      expect(finding.severity, FindingSeverity.high);
      expect(finding.stage, FindingStage.triaged);
      expect(finding.cvssScore, 7.4);
      expect(finding.cwe, 'CWE-79');
      expect(finding.targetId, isNull);
    });
  });
}
