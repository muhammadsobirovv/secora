import type {
  BugBountyFindingDto,
  CvssVectorComponents,
} from '@pentesthub/shared';
import type { BugBountyFinding } from '../../../prisma-types.js';

export function toBugBountyFindingDto(
  finding: BugBountyFinding,
  evidenceIds: string[],
): BugBountyFindingDto {
  return {
    id: finding.id,
    workspaceId: finding.workspaceId,
    projectId: finding.projectId,
    programId: finding.programId,
    targetId: finding.targetId,
    vulnFindingId: finding.vulnFindingId,
    title: finding.title,
    description: finding.description,
    severity: finding.severity,
    cvssScore: finding.cvssScore,
    cvssVector: finding.cvssVector,
    cwe: finding.cwe,
    vulnType: finding.vulnType,
    endpoint: finding.endpoint,
    payload: finding.payload,
    stage: finding.stage,
    duplicateOfId: finding.duplicateOfId,
    bountyAmount: finding.bountyAmount,
    currency: finding.currency,
    tags: finding.tags,
    createdBy: finding.createdBy,
    createdAt: finding.createdAt.toISOString(),
    updatedAt: finding.updatedAt.toISOString(),
    evidenceIds,
    capec: finding.capec,
    owaspCategory: finding.owaspCategory,
    mitreAttack: finding.mitreAttack as { id: string; name: string }[] | null,
    cvssBreakdown: finding.cvssBreakdown as CvssVectorComponents | null,
  };
}
