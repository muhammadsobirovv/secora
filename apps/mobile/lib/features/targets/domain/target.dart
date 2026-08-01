enum TargetType { domain, subdomain, url, ipAddress, cidr, api, mobileApp, internalAsset }

extension TargetTypeCodec on TargetType {
  String get wire => switch (this) {
        TargetType.domain => 'DOMAIN',
        TargetType.subdomain => 'SUBDOMAIN',
        TargetType.url => 'URL',
        TargetType.ipAddress => 'IP_ADDRESS',
        TargetType.cidr => 'CIDR',
        TargetType.api => 'API',
        TargetType.mobileApp => 'MOBILE_APP',
        TargetType.internalAsset => 'INTERNAL_ASSET',
      };

  static TargetType fromWire(String value) =>
      TargetType.values.firstWhere((t) => t.wire == value, orElse: () => TargetType.domain);
}

enum TargetScopeStatus { inScope, outOfScope, pendingReview }

extension TargetScopeStatusCodec on TargetScopeStatus {
  String get wire => switch (this) {
        TargetScopeStatus.inScope => 'IN_SCOPE',
        TargetScopeStatus.outOfScope => 'OUT_OF_SCOPE',
        TargetScopeStatus.pendingReview => 'PENDING_REVIEW',
      };

  static TargetScopeStatus fromWire(String value) =>
      TargetScopeStatus.values.firstWhere((t) => t.wire == value, orElse: () => TargetScopeStatus.pendingReview);
}

/// Mirrors packages/shared's `TargetDto` (targets.ts).
class Target {
  const Target({
    required this.id,
    required this.projectId,
    required this.type,
    required this.value,
    required this.environment,
    required this.scopeStatus,
    required this.createdAt,
    required this.updatedAt,
    this.name,
  });

  final String id;
  final String projectId;
  final TargetType type;
  final String value;
  final String? name;
  final String environment;
  final TargetScopeStatus scopeStatus;
  final DateTime createdAt;
  final DateTime updatedAt;

  factory Target.fromJson(Map<String, dynamic> json) => Target(
        id: json['id'] as String,
        projectId: json['projectId'] as String,
        type: TargetTypeCodec.fromWire(json['type'] as String),
        value: json['value'] as String,
        name: json['name'] as String?,
        environment: json['environment'] as String,
        scopeStatus: TargetScopeStatusCodec.fromWire(json['scopeStatus'] as String),
        createdAt: DateTime.parse(json['createdAt'] as String),
        updatedAt: DateTime.parse(json['updatedAt'] as String),
      );

  factory Target.fromRow(Map<String, Object?> row) => Target(
        id: row['id']! as String,
        projectId: row['project_id']! as String,
        type: TargetTypeCodec.fromWire(row['type']! as String),
        value: row['value']! as String,
        name: row['name'] as String?,
        environment: row['environment']! as String,
        scopeStatus: TargetScopeStatusCodec.fromWire(row['scope_status']! as String),
        createdAt: DateTime.parse(row['created_at']! as String),
        updatedAt: DateTime.parse(row['updated_at']! as String),
      );
}
