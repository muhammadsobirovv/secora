import { Inject, Injectable } from '@nestjs/common';
import {
  VULN_FINDINGS_REPOSITORY,
  type VulnFindingsRepository,
} from '../../vuln/domain/repositories/vuln-findings.repository.interface.js';
import type { AiTool, AiToolContext } from './ai-tool.interface.js';

@Injectable()
export class SearchFindingsTool implements AiTool {
  readonly name = 'search_findings' as const;
  readonly description =
    'Search vulnerability findings in the current project by keyword, severity, or status. Input: { query?: string, severity?: string, status?: string }.';

  constructor(
    @Inject(VULN_FINDINGS_REPOSITORY)
    private readonly vulnFindingsRepository: VulnFindingsRepository,
  ) {}

  async execute(
    input: Record<string, unknown>,
    context: AiToolContext,
  ): Promise<Record<string, unknown>> {
    const query = typeof input.query === 'string' ? input.query : undefined;
    const severity =
      typeof input.severity === 'string'
        ? (input.severity.toUpperCase() as never)
        : undefined;
    const status =
      typeof input.status === 'string'
        ? (input.status.toUpperCase() as never)
        : undefined;

    const findings = await this.vulnFindingsRepository.list({
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      search: query,
      severity,
      status,
      limit: 15,
    });

    return {
      count: findings.length,
      findings: findings.map((f) => ({
        id: f.id,
        title: f.title,
        severity: f.severity,
        status: f.status,
        cwe: f.cwe,
        owaspCategory: f.owaspCategory,
        path: f.path,
      })),
    };
  }
}
