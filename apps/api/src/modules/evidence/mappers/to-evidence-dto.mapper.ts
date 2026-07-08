import type { EvidenceDto } from '@pentesthub/shared';
import type { Evidence } from '../../../prisma-types.js';

export function toEvidenceDto(evidence: Evidence): EvidenceDto {
  return {
    id: evidence.id,
    projectId: evidence.projectId,
    targetId: evidence.targetId,
    type: evidence.type,
    title: evidence.title,
    description: evidence.description,
    textContent: evidence.textContent,
    checksum: evidence.checksum,
    createdBy: evidence.createdBy,
    createdAt: evidence.createdAt.toISOString(),
    updatedAt: evidence.updatedAt.toISOString(),
  };
}
