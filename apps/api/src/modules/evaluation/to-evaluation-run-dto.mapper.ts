import type { EvaluationRunDto } from '@pentesthub/shared';
import type { EvaluationRunRow } from './evaluation.repository.js';

export function toEvaluationRunDto(row: EvaluationRunRow): EvaluationRunDto {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    metricType: row.metricType,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    provider: row.provider,
    model: row.model,
    score: row.score,
    result: row.resultJson,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}
