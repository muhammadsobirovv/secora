import 'dart:convert';

import '../../../core/network/api_client.dart';
import '../../../core/network/sse_client.dart';
import '../domain/agent_run.dart';

/// Master AI Orchestrator — `AGENT_ORCHESTRATION_ENDPOINTS` (agent-endpoints.ts).
class AgentRepository {
  AgentRepository({required ApiClient apiClient, required SseClient sseClient})
      : _api = apiClient,
        _sse = sseClient;

  final ApiClient _api;
  final SseClient _sse;

  Future<List<OrchestrationRunSummary>> listRuns() => _api.get<List<OrchestrationRunSummary>>(
        '/agent/runs',
        decode: (json) => (json as List<dynamic>)
            .map((e) => OrchestrationRunSummary.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  Future<String> createRun(String goal, {String? projectId}) => _api.post<String>(
        '/agent/runs',
        body: {'goal': goal, if (projectId != null) 'projectId': projectId},
        decode: (json) => (json as Map<String, dynamic>)['id'] as String,
      );

  Future<Map<String, dynamic>> getRun(String id) =>
      _api.get<Map<String, dynamic>>('/agent/runs/$id', decode: (json) => json as Map<String, dynamic>);

  Stream<OrchestrationEvent> streamRun(String id) {
    return _sse
        .connect('/agent/runs/$id/stream')
        .map((raw) => OrchestrationEvent.fromJson(jsonDecode(raw) as Map<String, dynamic>));
  }

  Future<void> cancelRun(String id) => _api.post<void>('/agent/runs/$id/cancel');

  Future<void> retryRun(String id) => _api.post<void>('/agent/runs/$id/retry');

  Future<Map<String, dynamic>> explainRun(String id) =>
      _api.get<Map<String, dynamic>>('/agent/runs/$id/explain', decode: (json) => json as Map<String, dynamic>);
}
