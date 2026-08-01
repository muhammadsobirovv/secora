import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// File Manager — this project's backend has no standalone "file tree" API
/// (attachments are per-entity: `AttachableType`/`AttachmentDto`, uploaded
/// against a specific Project/Target/Note/Evidence/BugReport row, not a
/// freestanding folder structure — see packages/shared's attachments.ts).
/// So the mobile File Manager is scoped to what genuinely has no other
/// owner: the on-device cache of downloaded/exported files (reports/,
/// evidence/) under the app's documents directory — Upload/Download/
/// Preview/Rename/Delete/Search/Favorites/Offline cache all operate on
/// this local tree. Browsing a project's *remote* attachments happens on
/// that project/finding/report's own detail screen instead.
class FileManagerRepository {
  Future<Directory> _rootDir() async {
    final dir = await getApplicationDocumentsDirectory();
    final root = Directory(p.join(dir.path, 'pentesthub_files'));
    if (!await root.exists()) await root.create(recursive: true);
    return root;
  }

  Future<List<FileSystemEntity>> list({String? subfolder}) async {
    final root = await _rootDir();
    final target = subfolder == null ? root : Directory(p.join(root.path, subfolder));
    if (!await target.exists()) return [];
    return target.listSync();
  }

  Future<List<FileSystemEntity>> search(String query) async {
    final root = await _rootDir();
    final all = <FileSystemEntity>[];
    await for (final entity in root.list(recursive: true)) {
      if (p.basename(entity.path).toLowerCase().contains(query.toLowerCase())) {
        all.add(entity);
      }
    }
    return all;
  }

  Future<void> rename(FileSystemEntity entity, String newName) async {
    final newPath = p.join(p.dirname(entity.path), newName);
    await entity.rename(newPath);
  }

  Future<void> delete(FileSystemEntity entity) => entity.delete();

  Future<int> totalSizeBytes() async {
    final root = await _rootDir();
    var total = 0;
    await for (final entity in root.list(recursive: true)) {
      if (entity is File) total += await entity.length();
    }
    return total;
  }
}
