import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';

import '../../../core/storage/hive_boxes.dart';

/// Module 15 — task #348 "i18n architecture — English/Uzbek/Russian".
///
/// Mirrors `ThemeModeNotifier` exactly (same `NotifierProvider` + Hive
/// `settings_box` persistence shape) — see that file's own doc comment for
/// why `app.dart` needs this available from the very first frame rather
/// than deferred to the Settings screen build. `SettingsScreen`'s
/// "Language" row was a static placeholder (`Text('English (device
/// default)')`) before this task; it now reads/writes this provider the
/// same way the Theme row already does.
///
/// Deliberately a plain `Locale` (`en`/`uz`/`ru`), not the codegenerated
/// `AppLocalizations` — see `docs/architecture/i18n.md` for why: this
/// sandbox cannot run `flutter pub get`/`flutter gen-l10n` (no network
/// access to the Flutter/Dart artifact host — the same constraint already
/// disclosed in `pubspec.yaml`'s top-of-file comment), so no Dart file in
/// this repo can safely import the generated `AppLocalizations` class
/// until someone runs `flutter gen-l10n` once on a real machine (see
/// `l10n.yaml` + `lib/l10n/*.arb`, already scaffolded). This provider is
/// what feeds `MaterialApp.router`'s `locale:` — real, immediately-working
/// support for Flutter's own built-in Material/Widgets/Cupertino
/// localizations (date pickers, text direction, etc.) even before the
/// custom app-string catalog exists.
const _localeKey = 'locale';
const supportedLocales = <Locale>[Locale('en'), Locale('uz'), Locale('ru')];

final localeProvider = NotifierProvider<LocaleNotifier, Locale>(LocaleNotifier.new);

class LocaleNotifier extends Notifier<Locale> {
  @override
  Locale build() {
    final box = Hive.box<dynamic>(HiveBoxes.settings);
    final stored = box.get(_localeKey) as String?;
    final match = supportedLocales.where((l) => l.languageCode == stored);
    return match.isNotEmpty ? match.first : supportedLocales.first;
  }

  Future<void> setLocale(Locale locale) async {
    state = locale;
    final box = Hive.box<dynamic>(HiveBoxes.settings);
    await box.put(_localeKey, locale.languageCode);
  }
}
