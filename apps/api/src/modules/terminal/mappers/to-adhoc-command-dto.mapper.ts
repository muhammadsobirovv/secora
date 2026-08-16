import type { AdHocCommandDto } from '@pentesthub/shared';
import type { AdHocCommand } from '../../../prisma-types.js';

const OUTPUT_PREVIEW_MAX_CHARS = 20_000;

function preview(text: string | null): string | null {
  if (text == null) return null;
  return text.length > OUTPUT_PREVIEW_MAX_CHARS ? `${text.slice(0, OUTPUT_PREVIEW_MAX_CHARS)}\n… (truncated)` : text;
}

export function toAdHocCommandDto(command: AdHocCommand): AdHocCommandDto {
  return {
    id: command.id,
    workspaceId: command.workspaceId,
    projectId: command.projectId,
    targetId: command.targetId,
    tool: command.tool,
    kind: command.kind as AdHocCommandDto['kind'],
    argsSummary: command.argsSummary ?? '',
    classification: command.classification as AdHocCommandDto['classification'],
    status: command.status as AdHocCommandDto['status'],
    exitCode: command.exitCode,
    outputPreview: preview(command.stdout),
    stderrPreview: preview(command.stderr),
    rejectionReason: command.rejectionReason,
    approvalRequestId: command.approvalRequestId,
    requestedBy: command.requestedBy,
    source: command.source as AdHocCommandDto['source'],
    startedAt: command.startedAt ? command.startedAt.toISOString() : null,
    finishedAt: command.finishedAt ? command.finishedAt.toISOString() : null,
    durationMs: command.durationMs,
    createdAt: command.createdAt.toISOString(),
  };
}
