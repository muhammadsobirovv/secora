import type { BugBountyProgramDto } from '@pentesthub/shared';
import type { BugBountyProgram } from '../../../prisma-types.js';

export interface BugBountyProgramCounts {
  scopeItemCount: number;
  targetCount: number;
  findingCount: number;
}

export function toBugBountyProgramDto(
  program: BugBountyProgram,
  counts: BugBountyProgramCounts,
): BugBountyProgramDto {
  return {
    id: program.id,
    workspaceId: program.workspaceId,
    projectId: program.projectId,
    name: program.name,
    platform: program.platform,
    organization: program.organization,
    url: program.url,
    status: program.status,
    rulesMarkdown: program.rulesMarkdown,
    bountyTable: program.bountyTable as Record<string, unknown> | null,
    severityMatrix: program.severityMatrix as Record<string, unknown> | null,
    disclosurePolicy: program.disclosurePolicy,
    notesMarkdown: program.notesMarkdown,
    tags: program.tags,
    createdBy: program.createdBy,
    createdAt: program.createdAt.toISOString(),
    updatedAt: program.updatedAt.toISOString(),
    scopeItemCount: counts.scopeItemCount,
    targetCount: counts.targetCount,
    findingCount: counts.findingCount,
  };
}
