import '../../../core/network/api_client.dart';
import '../../../core/network/connectivity_service.dart';
import '../../../core/storage/local_database.dart';

/// Global Search — online, hits `SEARCH_ENDPOINTS.search` (Projects/
/// Targets/Notes/Evidence, per `SearchResultDto`). Offline, falls back to
/// the local FTS5 `search_index` table (`core/storage/local_database.dart`)
/// that every offline-editable repository's `_cacheLocally` keeps current —
/// covering the same four entity types the server search does, since
/// that's what's actually cached locally. Reports/AI Conversations/
/// Payloads/Knowledge Base search stay online-only (`ReportRepository`,
/// `AiChatRepository`, `KnowledgeBaseRepository` each already expose their
/// own search-shaped call — this repository does not duplicate those, it
/// only unifies the four workspace-foundation entity types plus a
/// pass-through for the others when online).
class GlobalSearchRepository {
  GlobalSearchRepository({
    required ApiClient apiClient,
    required LocalDatabase database,
    required ConnectivityService connectivity,
  })  : _api = apiClient,
        _db = database,
        _connectivity = connectivity;

  final ApiClient _api;
  final LocalDatabase _db;
  final ConnectivityService _connectivity;

  Future<List<SearchResult>> search(String query) async {
    if (query.trim().isEmpty) return [];
    if (_connectivity.isOnline) {
      try {
        return await _api.get<List<SearchResult>>(
          '/search',
          queryParameters: {'q': query},
          decode: (json) =>
              (json as List<dynamic>).map((e) => SearchResult.fromJson(e as Map<String, dynamic>)).toList(),
        );
      } catch (_) {
        // fall through to offline FTS
      }
    }
    final rows = await _db.raw.rawQuery(
      'SELECT entity_type, entity_id, project_id, title, snippet FROM search_index WHERE search_index MATCH ? LIMIT 50',
      ['${query.replaceAll('"', '')}*'],
    );
    return rows
        .map((r) => SearchResult(
              type: r['entity_type']! as String,
              id: r['entity_id']! as String,
              projectId: r['project_id'] as String?,
              title: r['title']! as String,
              snippet: r['snippet'] as String?,
            ))
        .toList();
  }
}

class SearchResult {
  const SearchResult({required this.type, required this.id, required this.title, this.projectId, this.snippet});
  final String type;
  final String id;
  final String? projectId;
  final String title;
  final String? snippet;

  factory SearchResult.fromJson(Map<String, dynamic> json) => SearchResult(
        type: json['type'] as String,
        id: json['id'] as String,
        projectId: json['projectId'] as String?,
        title: json['title'] as String,
        snippet: json['snippet'] as String?,
      );
}
