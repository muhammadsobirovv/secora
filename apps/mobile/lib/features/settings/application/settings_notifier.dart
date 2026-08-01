import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';

import '../../../core/storage/hive_boxes.dart';

/// Settings feature — Theme preference (light/dark/system), persisted to
/// the Hive `settings_box`. Declared minimally here (rather than deferred
/// to the full Settings screen build) because `app.dart`'s `MaterialApp`
/// needs a theme-mode source from the very first frame; the full Settings
/// screen (language, notifications, AI providers, voice, storage,
/// downloads, sync, privacy, developer mode) reads/writes the same
/// provider plus its own keys in the same box.
const _themeModeKey = 'theme_mode';

final themeModeProvider = NotifierProvider<ThemeModeNotifier, ThemeMode>(ThemeModeNotifier.new);

class ThemeModeNotifier extends Notifier<ThemeMode> {
  @override
  ThemeMode build() {
    final box = Hive.box<dynamic>(HiveBoxes.settings);
    final stored = box.get(_themeModeKey) as String?;
    return switch (stored) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      _ => ThemeMode.system,
    };
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    state = mode;
    final box = Hive.box<dynamic>(HiveBoxes.settings);
    await box.put(_themeModeKey, mode.name);
  }
}
