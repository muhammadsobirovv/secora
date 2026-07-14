import { Inject, Injectable } from '@nestjs/common';
import {
  VULN_SCAN_TEMPLATES_REPOSITORY,
  type VulnScanTemplatesRepository,
} from '../../vuln/domain/repositories/vuln-scan-templates.repository.interface.js';
import type { AiTool, AiToolContext } from './ai-tool.interface.js';

@Injectable()
export class SearchTemplatesTool implements AiTool {
  readonly name = 'search_templates' as const;
  readonly description =
    'Search vulnerability scan templates available in the current workspace. Input: { query?: string }.';

  constructor(
    @Inject(VULN_SCAN_TEMPLATES_REPOSITORY)
    private readonly vulnScanTemplatesRepository: VulnScanTemplatesRepository,
  ) {}

  async execute(
    input: Record<string, unknown>,
    context: AiToolContext,
  ): Promise<Record<string, unknown>> {
    const query =
      typeof input.query === 'string' ? input.query.toLowerCase() : undefined;

    const templates = await this.vulnScanTemplatesRepository.list(
      context.workspaceId,
    );
    const filtered = query
      ? templates.filter((t) => t.name.toLowerCase().includes(query))
      : templates;

    return {
      count: filtered.length,
      templates: filtered.map((t) => ({
        id: t.id,
        name: t.name,
        scanners: t.scanners,
        isBuiltIn: t.isBuiltIn,
      })),
    };
  }
}
