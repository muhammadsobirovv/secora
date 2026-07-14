import { Inject, Injectable } from '@nestjs/common';
import {
  EVIDENCE_REPOSITORY,
  type EvidenceRepository,
} from '../../evidence/domain/repositories/evidence.repository.interface.js';
import type { AiTool, AiToolContext } from './ai-tool.interface.js';

@Injectable()
export class SearchEvidenceTool implements AiTool {
  readonly name = 'search_evidence' as const;
  readonly description =
    'Search collected evidence (HTTP requests/responses, screenshots, logs, payloads, commands) in the current project. Input: { query?: string, targetId?: string }.';

  constructor(
    @Inject(EVIDENCE_REPOSITORY)
    private readonly evidenceRepository: EvidenceRepository,
  ) {}

  async execute(
    input: Record<string, unknown>,
    context: AiToolContext,
  ): Promise<Record<string, unknown>> {
    const query =
      typeof input.query === 'string' ? input.query.toLowerCase() : undefined;
    const targetId =
      typeof input.targetId === 'string' ? input.targetId : undefined;

    const evidence = await this.evidenceRepository.list(
      context.projectId,
      targetId,
    );
    const filtered = query
      ? evidence.filter(
          (e) =>
            e.title.toLowerCase().includes(query) ||
            (e.description ?? '').toLowerCase().includes(query) ||
            (e.textContent ?? '').toLowerCase().includes(query),
        )
      : evidence;
    const limited = filtered.slice(0, 15);

    return {
      count: filtered.length,
      evidence: limited.map((e) => ({
        id: e.id,
        type: e.type,
        title: e.title,
        excerpt: e.textContent ? e.textContent.slice(0, 400) : null,
      })),
    };
  }
}
