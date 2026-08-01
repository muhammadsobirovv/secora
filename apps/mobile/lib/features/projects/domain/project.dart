/// Mirrors packages/shared's `ProjectDto`/`TagDto` (projects.ts, tags.ts).
class Tag {
  const Tag({required this.id, required this.name, this.color});
  final String id;
  final String name;
  final String? color;

  factory Tag.fromJson(Map<String, dynamic> json) =>
      Tag(id: json['id'] as String, name: json['name'] as String, color: json['color'] as String?);
}

enum ProjectStatus { active, onHold, completed, archived }

extension ProjectStatusCodec on ProjectStatus {
  String get wire => switch (this) {
        ProjectStatus.active => 'ACTIVE',
        ProjectStatus.onHold => 'ON_HOLD',
        ProjectStatus.completed => 'COMPLETED',
        ProjectStatus.archived => 'ARCHIVED',
      };

  static ProjectStatus fromWire(String value) => switch (value) {
        'ACTIVE' => ProjectStatus.active,
        'ON_HOLD' => ProjectStatus.onHold,
        'COMPLETED' => ProjectStatus.completed,
        'ARCHIVED' => ProjectStatus.archived,
        _ => ProjectStatus.active,
      };

  String get label => switch (this) {
        ProjectStatus.active => 'Active',
        ProjectStatus.onHold => 'On hold',
        ProjectStatus.completed => 'Completed',
        ProjectStatus.archived => 'Archived',
      };
}

class Project {
  const Project({
    required this.id,
    required this.workspaceId,
    required this.name,
    required this.status,
    required this.visibility,
    required this.isFavorite,
    required this.tags,
    required this.createdAt,
    required this.updatedAt,
    this.description,
  });

  final String id;
  final String workspaceId;
  final String name;
  final String? description;
  final ProjectStatus status;
  final String visibility;
  final bool isFavorite;
  final List<Tag> tags;
  final DateTime createdAt;
  final DateTime updatedAt;

  factory Project.fromJson(Map<String, dynamic> json) => Project(
        id: json['id'] as String,
        workspaceId: json['workspaceId'] as String,
        name: json['name'] as String,
        description: json['description'] as String?,
        status: ProjectStatusCodec.fromWire(json['status'] as String),
        visibility: json['visibility'] as String,
        isFavorite: json['isFavorite'] as bool,
        tags: ((json['tags'] as List<dynamic>?) ?? [])
            .map((e) => Tag.fromJson(e as Map<String, dynamic>))
            .toList(),
        createdAt: DateTime.parse(json['createdAt'] as String),
        updatedAt: DateTime.parse(json['updatedAt'] as String),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'workspaceId': workspaceId,
        'name': name,
        'description': description,
        'status': status.wire,
        'visibility': visibility,
        'isFavorite': isFavorite,
        'tags': tags.map((t) => {'id': t.id, 'name': t.name, 'color': t.color}).toList(),
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
      };

  /// sqflite row shape — see core/storage/local_database.dart's `projects` table.
  factory Project.fromRow(Map<String, Object?> row) => Project(
        id: row['id']! as String,
        workspaceId: row['workspace_id']! as String,
        name: row['name']! as String,
        description: row['description'] as String?,
        status: ProjectStatusCodec.fromWire(row['status']! as String),
        visibility: row['visibility']! as String,
        isFavorite: (row['is_favorite']! as int) == 1,
        tags: const [], // tags_json parsed by the repository when needed for display.
        createdAt: DateTime.parse(row['created_at']! as String),
        updatedAt: DateTime.parse(row['updated_at']! as String),
      );
}
