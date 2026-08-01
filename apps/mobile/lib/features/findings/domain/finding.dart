enum FindingSeverity { critical, high, medium, low, info }

extension FindingSeverityCodec on FindingSeverity {
  String get wire => name.toUpperCase();

  static FindingSeverity fromWire(String value) => FindingSeverity.values
      .firstWhere((s) => s.wire == value, orElse: () => FindingSeverity.info);
}

/// Mirrors `BUGBOUNTY_FINDING_STAGE_ORDER` (packages/shared/src/bugbounty.ts)
/// — kept as the flat set actually surfaced on mobile; DUPLICATE/
/// NEED_MORE_INFO/REJECTED/ARCHIVED are shown via [label] but not part of
/// the primary stepper (matches the ADR 0006 side-branch note).
enum FindingStage {
  draft,
  new_,
  triaged,
  verified,
  reported,
  duplicate,
  informative,
  accepted,
  needMoreInfo,
  rejected,
  resolved,
  closed,
  archived,
}

extension FindingStageCodec on FindingStage {
  String get wire => switch (this) {
        FindingStage.new_ => 'NEW',
        FindingStage.needMoreInfo => 'NEED_MORE_INFO',
        _ => name.toUpperCase(),
      };

  static FindingStage fromWire(String value) => FindingStage.values
      .firstWhere((s) => s.wire == value, orElse: () => FindingStage.new_);

  String get label => switch (this) {
        FindingStage.new_ => 'New',
        FindingStage.needMoreInfo => 'Need more info',
        _ => wire[0] + wire.substring(1).toLowerCase(),
      };
}

/// Mirrors packages/shared's `BugBountyFindingDto` (bugbounty.ts) — a
/// deliberately trimmed field set (the mobile UI's Findings feature spec
/// doesn't need every enterprise/CVSS-vector field the web dashboard's
/// finding editor does); `rawJson` retains the full server payload so nothing
/// is lost, just not all of it is modeled as typed fields yet.
class Finding {
  const Finding({
    required this.id,
    required this.workspaceId,
    required this.projectId,
    required this.title,
    required this.description,
    required this.severity,
    required this.stage,
    required this.createdAt,
    required this.updatedAt,
    this.programId,
    this.targetId,
    this.cvssScore,
    this.cwe,
  });

  final String id;
  final String workspaceId;
  final String projectId;
  final String? programId;
  final String? targetId;
  final String title;
  final String description;
  final FindingSeverity severity;
  final FindingStage stage;
  final double? cvssScore;
  final String? cwe;
  final DateTime createdAt;
  final DateTime updatedAt;

  factory Finding.fromJson(Map<String, dynamic> json) => Finding(
        id: json['id'] as String,
        workspaceId: json['workspaceId'] as String,
        projectId: json['projectId'] as String,
        programId: json['programId'] as String?,
        targetId: json['targetId'] as String?,
        title: json['title'] as String,
        description: json['description'] as String,
        severity: FindingSeverityCodec.fromWire(json['severity'] as String),
        stage: FindingStageCodec.fromWire(json['stage'] as String),
        cvssScore: (json['cvssScore'] as num?)?.toDouble(),
        cwe: json['cwe'] as String?,
        createdAt: DateTime.parse(json['createdAt'] as String),
        updatedAt: DateTime.parse(json['updatedAt'] as String),
      );

  factory Finding.fromRow(Map<String, Object?> row) => Finding(
        id: row['id']! as String,
        workspaceId: row['workspace_id']! as String,
        projectId: row['project_id']! as String,
        programId: row['program_id'] as String?,
        targetId: row['target_id'] as String?,
        title: row['title']! as String,
        description: row['description']! as String,
        severity: FindingSeverityCodec.fromWire(row['severity']! as String),
        stage: FindingStageCodec.fromWire(row['stage']! as String),
        cvssScore: (row['cvss_score'] as num?)?.toDouble(),
        cwe: row['cwe'] as String?,
        createdAt: DateTime.parse(row['created_at']! as String),
        updatedAt: DateTime.parse(row['updated_at']! as String),
      );
}
