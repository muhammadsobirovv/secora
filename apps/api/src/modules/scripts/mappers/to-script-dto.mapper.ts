import type { ScriptDefinitionDto, ScriptExecutionDto } from '@pentesthub/shared';
import type { ScriptDefinitionRow, ScriptExecutionRow } from '../scripts.repository.js';

export function toScriptDefinitionDto(row: ScriptDefinitionRow): ScriptDefinitionDto {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    description: row.description,
    language: row.language,
    sourceCode: row.sourceCode,
    permissions: row.permissions,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toScriptExecutionDto(row: ScriptExecutionRow): ScriptExecutionDto {
  return {
    id: row.id,
    scriptDefinitionId: row.scriptDefinitionId,
    workspaceId: row.workspaceId,
    status: row.status,
    input: row.inputJson,
    output: row.outputJson,
    logs: row.logs,
    errorMessage: row.errorMessage,
    durationMs: row.durationMs,
    triggeredBy: row.triggeredBy,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
