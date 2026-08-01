import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pentesthub_mobile/features/findings/domain/finding.dart';
import 'package:pentesthub_mobile/features/findings/presentation/widgets/severity_badge.dart';

void main() {
  testWidgets('SeverityBadge renders the severity code as its label', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: SeverityBadge(severity: FindingSeverity.critical)),
      ),
    );

    expect(find.text('CRITICAL'), findsOneWidget);
  });

  testWidgets('SeverityBadge renders a distinct label per severity', (tester) async {
    for (final severity in FindingSeverity.values) {
      await tester.pumpWidget(
        MaterialApp(home: Scaffold(body: SeverityBadge(severity: severity))),
      );
      expect(find.text(severity.wire), findsOneWidget);
    }
  });
}
