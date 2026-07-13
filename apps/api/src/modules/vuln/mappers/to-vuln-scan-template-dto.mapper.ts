import type { VulnScanTemplateDto } from '@pentesthub/shared';
import type { VulnScanTemplate } from '../../../prisma-types.js';

export function toVulnScanTemplateDto(
  template: VulnScanTemplate,
): VulnScanTemplateDto {
  return {
    id: template.id,
    workspaceId: template.workspaceId,
    name: template.name,
    description: template.description,
    scanners: template.scanners,
    config: template.config as Record<string, unknown> | null,
    isBuiltIn: template.isBuiltIn,
    createdBy: template.createdBy,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}
