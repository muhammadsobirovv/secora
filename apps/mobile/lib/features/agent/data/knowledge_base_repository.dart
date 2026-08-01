import '../../../core/network/api_client.dart';

/// AI Knowledge Base (OWASP/CWE/CAPEC/MITRE ATT&CK/NIST/CVE) — read-only on
/// mobile (upsert/reindex stay a Web Dashboard admin action, same split as
/// KnowledgeBaseReferencesController's own permission boundary suggests).
class KnowledgeBaseRepository {
  KnowledgeBaseRepository({required ApiClient apiClient}) : _api = apiClient;
  final ApiClient _api;

  Future<List<KnowledgeBaseEntry>> search(String query) => _api.get<List<KnowledgeBaseEntry>>(
        '/knowledge-base/references/search',
        queryParameters: {'q': query},
        decode: (json) => (json as List<dynamic>)
            .map((e) => KnowledgeBaseEntry.fromJson(
                ((e as Map<String, dynamic>)['entry'] as Map<String, dynamic>)))
            .toList(),
      );

  Future<List<KnowledgeBaseEntry>> list({String? framework}) => _api.get<List<KnowledgeBaseEntry>>(
        '/knowledge-base/references',
        queryParameters: {if (framework != null) 'framework': framework},
        decode: (json) =>
            (json as List<dynamic>).map((e) => KnowledgeBaseEntry.fromJson(e as Map<String, dynamic>)).toList(),
      );
}

class KnowledgeBaseEntry {
  const KnowledgeBaseEntry({
    required this.id,
    required this.framework,
    required this.code,
    required this.title,
    required this.summary,
  });

  final String id;
  final String framework;
  final String code;
  final String title;
  final String summary;

  factory KnowledgeBaseEntry.fromJson(Map<String, dynamic> json) => KnowledgeBaseEntry(
        id: json['id'] as String,
        framework: json['framework'] as String? ?? '',
        code: json['code'] as String? ?? '',
        title: json['title'] as String,
        summary: json['summary'] as String? ?? '',
      );
}
