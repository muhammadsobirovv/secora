import '../../../core/network/api_client.dart';

/// Workspace — `WORKSPACE_ENDPOINTS` (workspace-foundation-endpoints.ts).
/// Roles/Permissions are read-only here (role changes stay a Web Dashboard
/// admin action); Statistics/Usage reuse the same `/bugbounty/dashboard`
/// summary the Dashboard feature already calls rather than a second
/// endpoint.
class WorkspaceRepository {
  WorkspaceRepository({required ApiClient apiClient}) : _api = apiClient;
  final ApiClient _api;

  Future<WorkspaceInfo> get() => _api.get<WorkspaceInfo>(
        '/workspace',
        decode: (json) => WorkspaceInfo.fromJson(json as Map<String, dynamic>),
      );

  Future<List<WorkspaceMember>> listMembers() => _api.get<List<WorkspaceMember>>(
        '/workspace/members',
        decode: (json) =>
            (json as List<dynamic>).map((e) => WorkspaceMember.fromJson(e as Map<String, dynamic>)).toList(),
      );
}

class WorkspaceInfo {
  const WorkspaceInfo({required this.id, required this.name, required this.slug, this.description});
  final String id;
  final String name;
  final String slug;
  final String? description;

  factory WorkspaceInfo.fromJson(Map<String, dynamic> json) => WorkspaceInfo(
        id: json['id'] as String,
        name: json['name'] as String,
        slug: json['slug'] as String,
        description: json['description'] as String?,
      );
}

class WorkspaceMember {
  const WorkspaceMember({required this.userId, required this.role, required this.joinedAt});
  final String userId;
  final String role;
  final String joinedAt;

  factory WorkspaceMember.fromJson(Map<String, dynamic> json) => WorkspaceMember(
        userId: json['userId'] as String,
        role: json['role'] as String,
        joinedAt: json['joinedAt'] as String,
      );
}
