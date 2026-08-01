enum OrchestrationRunStatus { pending, planning, running, paused, completed, failed, cancelled }

extension OrchestrationRunStatusCodec on OrchestrationRunStatus {
  String get wire => name.toUpperCase();
  static OrchestrationRunStatus fromWire(String value) => OrchestrationRunStatus.values
      .firstWhere((s) => s.wire == value, orElse: () => OrchestrationRunStatus.pending);

  bool get isTerminal =>
      this == OrchestrationRunStatus.completed ||
      this == OrchestrationRunStatus.failed ||
      this == OrchestrationRunStatus.cancelled;
}

enum AgentTaskStatus { queued, running, completed, failed, cancelled, retrying }

extension AgentTaskStatusCodec on AgentTaskStatus {
  String get wire => name.toUpperCase();
  static AgentTaskStatus fromWire(String value) =>
      AgentTaskStatus.values.firstWhere((s) => s.wire == value, orElse: () => AgentTaskStatus.queued);
}

/// Mirrors `OrchestrationRunSummaryDto` (packages/shared/src/agent.ts) —
/// the list-view shape (task counts, not the full task tree).
class OrchestrationRunSummary {
  const OrchestrationRunSummary({
    required this.id,
    required this.goal,
    required this.status,
    required this.taskCount,
    required this.completedTaskCount,
    required this.failedTaskCount,
    required this.createdAt,
    this.confidenceScore,
  });

  final String id;
  final String goal;
  final OrchestrationRunStatus status;
  final double? confidenceScore;
  final int taskCount;
  final int completedTaskCount;
  final int failedTaskCount;
  final DateTime createdAt;

  factory OrchestrationRunSummary.fromJson(Map<String, dynamic> json) => OrchestrationRunSummary(
        id: json['id'] as String,
        goal: json['goal'] as String,
        status: OrchestrationRunStatusCodec.fromWire(json['status'] as String),
        confidenceScore: (json['confidenceScore'] as num?)?.toDouble(),
        taskCount: (json['taskCount'] as num).toInt(),
        completedTaskCount: (json['completedTaskCount'] as num).toInt(),
        failedTaskCount: (json['failedTaskCount'] as num).toInt(),
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}

/// Mirrors `AgentTaskDto` — recursive via [subTasks], built client-side from
/// the flat `parentTaskId` list the same way apps/web's
/// AgentExplainabilityService reconstructs the tree server-side (this is
/// the *live* run tree via SSE, not the explainability aggregation).
class AgentTask {
  const AgentTask({
    required this.id,
    required this.agentType,
    required this.title,
    required this.status,
    this.reasoningSummary,
    this.confidenceScore,
    this.errorMessage,
    this.subTasks = const [],
  });

  final String id;
  final String agentType;
  final String title;
  final AgentTaskStatus status;
  final String? reasoningSummary;
  final double? confidenceScore;
  final String? errorMessage;
  final List<AgentTask> subTasks;

  factory AgentTask.fromJson(Map<String, dynamic> json) => AgentTask(
        id: json['id'] as String,
        agentType: json['agentType'] as String,
        title: json['title'] as String,
        status: AgentTaskStatusCodec.fromWire(json['status'] as String),
        reasoningSummary: json['reasoningSummary'] as String?,
        confidenceScore: (json['confidenceScore'] as num?)?.toDouble(),
        errorMessage: json['errorMessage'] as String?,
      );

  AgentTask copyWith({AgentTaskStatus? status, String? reasoningSummary}) => AgentTask(
        id: id,
        agentType: agentType,
        title: title,
        status: status ?? this.status,
        reasoningSummary: reasoningSummary ?? this.reasoningSummary,
        confidenceScore: confidenceScore,
        errorMessage: errorMessage,
        subTasks: subTasks,
      );
}

/// Mirrors `OrchestrationStreamEvent` — the live SSE feed while a run is
/// PLANNING/RUNNING.
sealed class OrchestrationEvent {
  const OrchestrationEvent();

  factory OrchestrationEvent.fromJson(Map<String, dynamic> json) {
    return switch (json['type'] as String) {
      'task_started' => TaskStarted(AgentTask.fromJson(json['task'] as Map<String, dynamic>)),
      'task_progress' => TaskProgress(json['taskId'] as String, json['reasoningSummary'] as String),
      'task_completed' => TaskCompleted(AgentTask.fromJson(json['task'] as Map<String, dynamic>)),
      'task_failed' => TaskFailed(AgentTask.fromJson(json['task'] as Map<String, dynamic>)),
      'run_completed' => RunCompleted(OrchestrationRunStatusCodec.fromWire(
          (json['run'] as Map<String, dynamic>)['status'] as String)),
      'run_failed' => RunFailed(json['message'] as String),
      'cancelled' => const RunCancelled(),
      _ => const RunEventUnknown(),
    };
  }
}

final class TaskStarted extends OrchestrationEvent {
  const TaskStarted(this.task);
  final AgentTask task;
}

final class TaskProgress extends OrchestrationEvent {
  const TaskProgress(this.taskId, this.reasoningSummary);
  final String taskId;
  final String reasoningSummary;
}

final class TaskCompleted extends OrchestrationEvent {
  const TaskCompleted(this.task);
  final AgentTask task;
}

final class TaskFailed extends OrchestrationEvent {
  const TaskFailed(this.task);
  final AgentTask task;
}

final class RunCompleted extends OrchestrationEvent {
  const RunCompleted(this.status);
  final OrchestrationRunStatus status;
}

final class RunFailed extends OrchestrationEvent {
  const RunFailed(this.message);
  final String message;
}

final class RunCancelled extends OrchestrationEvent {
  const RunCancelled();
}

final class RunEventUnknown extends OrchestrationEvent {
  const RunEventUnknown();
}
