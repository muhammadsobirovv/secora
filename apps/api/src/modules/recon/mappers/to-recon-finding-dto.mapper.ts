import type { ReconFindingDto } from '@pentesthub/shared';
import type { ReconFinding } from '../../../prisma-types.js';

export function toReconFindingDto(finding: ReconFinding): ReconFindingDto {
  return {
    id: finding.id,
    jobId: finding.jobId,
    workspaceId: finding.workspaceId,
    projectId: finding.projectId,
    targetId: finding.targetId,
    type: finding.type,
    value: finding.value,
    data: finding.data as Record<string, unknown>,
    source: finding.source,
    dedupKey: finding.dedupKey,
    firstSeenAt: finding.firstSeenAt.toISOString(),
    lastSeenAt: finding.lastSeenAt.toISOString(),
    promotedTargetId: finding.promotedTargetId,
    createdAt: finding.createdAt.toISOString(),
  };
}
