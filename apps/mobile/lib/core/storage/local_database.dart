import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

/// The offline-first relational store. Hive (see `hive_boxes.dart`) holds
/// small key-value/blob data (auth session, settings, cached AI
/// conversations as JSON blobs); sqflite holds everything that needs to be
/// *searched* or *filtered* while offline — projects, targets, findings,
/// notes, evidence metadata — plus the [outbox] table that
/// `core/sync/sync_engine.dart` drains when connectivity returns.
///
/// Table shapes intentionally mirror packages/shared's DTOs field-for-field
/// (see `ProjectDto`, `TargetDto`, `BugBountyFindingDto`, `NoteDto`,
/// `EvidenceDto`) with an added `_dirty` flag per row for optimistic local
/// edits made while offline, and `_syncedAt` for conflict resolution
/// (last-write-wins by comparing local `_dirty` timestamp against the
/// server's `updatedAt` on reconnect — see sync_engine.dart's doc comment).
class LocalDatabase {
  LocalDatabase._(this._db);

  final Database _db;
  Database get raw => _db;

  static const int schemaVersion = 1;

  static Future<LocalDatabase> open() async {
    final dbPath = await getDatabasesPath();
    final path = p.join(dbPath, 'pentesthub_offline.db');
    final db = await openDatabase(
      path,
      version: schemaVersion,
      onCreate: (db, version) async {
        final batch = db.batch();
        _createSchema(batch);
        await batch.commit(noResult: true);
      },
    );
    return LocalDatabase._(db);
  }

  static void _createSchema(Batch batch) {
    batch.execute('''
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL,
        visibility TEXT NOT NULL,
        is_favorite INTEGER NOT NULL DEFAULT 0,
        tags_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        is_dirty INTEGER NOT NULL DEFAULT 0,
        synced_at TEXT
      )
    ''');
    batch.execute('CREATE INDEX idx_projects_status ON projects(status)');

    batch.execute('''
      CREATE TABLE targets (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        type TEXT NOT NULL,
        value TEXT NOT NULL,
        name TEXT,
        description TEXT,
        environment TEXT NOT NULL,
        scope_status TEXT NOT NULL,
        tags_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        is_dirty INTEGER NOT NULL DEFAULT 0,
        synced_at TEXT
      )
    ''');
    batch.execute('CREATE INDEX idx_targets_project ON targets(project_id)');

    batch.execute('''
      CREATE TABLE findings (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        program_id TEXT,
        target_id TEXT,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        severity TEXT NOT NULL,
        stage TEXT NOT NULL,
        cvss_score REAL,
        cwe TEXT,
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        is_dirty INTEGER NOT NULL DEFAULT 0,
        synced_at TEXT
      )
    ''');
    batch.execute('CREATE INDEX idx_findings_project ON findings(project_id)');
    batch.execute('CREATE INDEX idx_findings_severity ON findings(severity)');

    batch.execute('''
      CREATE TABLE notes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        target_id TEXT,
        title TEXT,
        content TEXT NOT NULL,
        author_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        is_dirty INTEGER NOT NULL DEFAULT 0,
        synced_at TEXT
      )
    ''');

    batch.execute('''
      CREATE TABLE evidence (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        target_id TEXT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        text_content TEXT,
        checksum TEXT,
        local_file_path TEXT,
        upload_status TEXT NOT NULL DEFAULT 'PENDING',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        is_dirty INTEGER NOT NULL DEFAULT 0,
        synced_at TEXT
      )
    ''');
    batch.execute('CREATE INDEX idx_evidence_project ON evidence(project_id)');

    // FTS5 virtual table backing the Global Search feature's offline mode —
    // kept in sync by triggers below whenever the source tables change.
    batch.execute('''
      CREATE VIRTUAL TABLE search_index USING fts5(
        entity_type UNINDEXED,
        entity_id UNINDEXED,
        project_id UNINDEXED,
        title,
        snippet
      )
    ''');

    batch.execute('''
      CREATE TABLE outbox (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      )
    ''');

    batch.execute('''
      CREATE TABLE ai_conversations_cache (
        id TEXT PRIMARY KEY,
        title TEXT,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        messages_json TEXT NOT NULL
      )
    ''');
  }

  /// Rebuilds the FTS index row for one entity — called by every
  /// repository's local-write path (create/update) so offline Global
  /// Search stays current without a separate reindex pass.
  Future<void> upsertSearchIndex({
    required String entityType,
    required String entityId,
    required String? projectId,
    required String title,
    String? snippet,
  }) async {
    await _db.delete(
      'search_index',
      where: 'entity_type = ? AND entity_id = ?',
      whereArgs: [entityType, entityId],
    );
    await _db.insert('search_index', {
      'entity_type': entityType,
      'entity_id': entityId,
      'project_id': projectId,
      'title': title,
      'snippet': snippet ?? '',
    });
  }

  Future<void> close() => _db.close();
}
