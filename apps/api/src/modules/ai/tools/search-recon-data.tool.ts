import { Inject, Injectable } from '@nestjs/common';
import {
  RECON_FINDINGS_REPOSITORY,
  type ReconFindingsRepository,
} from '../../recon/domain/repositories/recon-findings.repository.interface.js';
import type { AiTool, AiToolContext } from './ai-tool.interface.js';

@Injectable()
export class SearchReconDataTool implements AiTool {
  readonly name = 'search_recon_data' as const;
  readonly description =
    'Search reconnaissance findings (subdomains, ports, technologies, DNS records, etc.) in the current project. Input: { type?: string, query?: string }.';

  constructor(
    @Inject(RECON_FINDINGS_REPOSITORY)
    private readonly reconFindingsRepository: ReconFindingsRepository,
  ) {}

  async execute(
    input: Record<string, unknown>,
    context: AiToolContext,
  ): Promise<Record<string, unknown>> {
    const type =
      typeof input.type === 'string'
        ? (input.type.toUpperCase() as never)
        : undefined;
    const query =
      typeof input.query === 'string' ? input.query.toLowerCase() : undefined;

    const findings = await this.reconFindingsRepository.list({
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      type,
    });

    const filtered = query
      ? findings.filter((f) => f.value.toLowerCase().includes(query))
      : findings;
    const limited = filtered.slice(0, 25);

    return {
      count: filtered.length,
      findings: limited.map((f) => ({
        id: f.id,
        type: f.type,
        value: f.value,
        source: f.source,
      })),
    };
  }
}
