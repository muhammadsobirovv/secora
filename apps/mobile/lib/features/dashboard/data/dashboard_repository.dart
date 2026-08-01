import '../../../core/network/api_client.dart';

/// Aggregates `/bugbounty/dashboard`, `/bugbounty/statistics`, and
/// `/activity` for the Dashboard feature's summary widgets — deliberately
/// thin (no offline cache of its own): Dashboard always shows Projects/
/// Findings/Recent Activity via those features' own offline-first
/// repositories, this class only owns the two summary-shaped endpoints that
/// have no other client owner.
class DashboardRepository {
  DashboardRepository({required ApiClient apiClient}) : _api = apiClient;
  final ApiClient _api;

  Future<DashboardSummary> getSummary() => _api.get<DashboardSummary>(
        '/bugbounty/dashboard',
        decode: (json) => DashboardSummary.fromJson(json as Map<String, dynamic>),
      );

  Future<List<ActivityEvent>> getRecentActivity({String? projectId, int limit = 20}) =>
      _api.get<List<ActivityEvent>>(
        '/activity',
        queryParameters: {if (projectId != null) 'projectId': projectId, 'limit': limit},
        decode: (json) =>
            (json as List<dynamic>).map((e) => ActivityEvent.fromJson(e as Map<String, dynamic>)).toList(),
      );
}

/// Loosely-typed summary — the backend's `/bugbounty/dashboard` payload
/// shape is a dashboard-specific aggregate DTO (widget counts, not a
/// registered packages/shared type), so this reads the fields the mobile
/// Dashboard widgets actually render rather than mirroring a nonexistent
/// shared DTO 1:1.
class DashboardSummary {
  const DashboardSummary({
    required this.totalProjects,
    required this.totalFindings,
    required this.openFindings,
    required this.criticalFindings,
    required this.totalReports,
  });

  final int totalProjects;
  final int totalFindings;
  final int openFindings;
  final int criticalFindings;
  final int totalReports;

  factory DashboardSummary.fromJson(Map<String, dynamic> json) => DashboardSummary(
        totalProjects: (json['totalProjects'] as num?)?.toInt() ?? 0,
        totalFindings: (json['totalFindings'] as num?)?.toInt() ?? 0,
        openFindings: (json['openFindings'] as num?)?.toInt() ?? 0,
        criticalFindings: (json['criticalFindings'] as num?)?.toInt() ?? 0,
        totalReports: (json['totalReports'] as num?)?.toInt() ?? 0,
      );

  factory DashboardSummary.empty() => const DashboardSummary(
        totalProjects: 0,
        totalFindings: 0,
        openFindings: 0,
        criticalFindings: 0,
        totalReports: 0,
      );
}

class ActivityEvent {
  const ActivityEvent({
    required this.id,
    required this.verb,
    required this.entityType,
    required this.entityId,
    required this.createdAt,
    this.projectId,
  });

  final String id;
  final String verb;
  final String entityType;
  final String entityId;
  final String? projectId;
  final DateTime createdAt;

  factory ActivityEvent.fromJson(Map<String, dynamic> json) => ActivityEvent(
        id: json['id'] as String,
        verb: json['verb'] as String,
        entityType: json['entityType'] as String,
        entityId: json['entityId'] as String,
        projectId: json['projectId'] as String?,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );

  String get description => '$verb ${entityType.toLowerCase()}';
}
