import type { PromptTemplateDto } from '@pentesthub/shared';
import type { PromptTemplateRecord } from '../domain/repositories/prompt-template.repository.interface.js';

export function toPromptTemplateDto(record: PromptTemplateRecord): PromptTemplateDto {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    name: record.name,
    description: record.description,
    promptText: record.promptText,
    category: record.category,
    createdBy: record.createdBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
