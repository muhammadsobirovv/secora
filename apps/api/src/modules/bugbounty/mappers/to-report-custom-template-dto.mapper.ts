import type { ReportCustomTemplateDto } from '@pentesthub/shared';
import type { ReportCustomTemplate } from '../../../prisma-types.js';

export function toReportCustomTemplateDto(
  template: ReportCustomTemplate,
): ReportCustomTemplateDto {
  return {
    id: template.id,
    workspaceId: template.workspaceId,
    name: template.name,
    description: template.description,
    sections: template.sections as unknown as ReportCustomTemplateDto['sections'],
    createdBy: template.createdBy,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}
