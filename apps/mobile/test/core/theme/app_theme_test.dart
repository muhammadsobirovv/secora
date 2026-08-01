import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pentesthub_mobile/core/theme/app_theme.dart';

void main() {
  testWidgets('light and dark themes build a full widget tree without throwing', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        darkTheme: AppTheme.dark,
        home: const Scaffold(body: Center(child: Text('Themed'))),
      ),
    );
    expect(find.text('Themed'), findsOneWidget);
  });

  test('dark theme uses dark brightness and light theme uses light brightness', () {
    expect(AppTheme.dark.brightness, Brightness.dark);
    expect(AppTheme.light.brightness, Brightness.light);
  });
}
