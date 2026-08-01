import 'package:hive_flutter/hive_flutter.dart';

/// Small key-value/blob data that doesn't need SQL querying — auth session
/// snapshot (for instant cold-start UI before the network round-trip
/// resolves), user preferences/settings, pinned/favorite ID sets, and the
/// download/file cache manifest. Structured, filterable domain data
/// (projects/targets/findings/notes/evidence) lives in `local_database.dart`
/// (sqflite) instead — see that file's doc comment for the split rationale.
abstract final class HiveBoxes {
  static const String settings = 'settings_box';
  static const String authSession = 'auth_session_box';
  static const String favorites = 'favorites_box';
  static const String fileCache = 'file_cache_box';
  static const String notifications = 'notifications_box';
  static const String promptLibrary = 'prompt_library_box';

  static Future<void> initialize() async {
    await Hive.initFlutter();
    await Future.wait([
      Hive.openBox<dynamic>(settings),
      Hive.openBox<dynamic>(authSession),
      Hive.openBox<dynamic>(favorites),
      Hive.openBox<dynamic>(fileCache),
      Hive.openBox<dynamic>(notifications),
      Hive.openBox<dynamic>(promptLibrary),
    ]);
  }
}
