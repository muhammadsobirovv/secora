import { Inject, Injectable } from '@nestjs/common';
import {
  TARGETS_REPOSITORY,
  type TargetsRepository,
} from '../../targets/domain/repositories/targets.repository.interface.js';
import type { AiTool, AiToolContext } from './ai-tool.interface.js';

@Injectable()
export class SearchTargetsTool implements AiTool {
  readonly name = 'search_targets' as const;
  readonly description =
    'Search targets in the current project by value/name/type. Input: { query?: string, type?: string }.';

  constructor(
    @Inject(TARGETS_REPOSITORY)
    private readonly targetsRepository: TargetsRepository,
  ) {}

  async execute(
    input: Record<string, unknown>,
    context: AiToolContext,
  ): Promise<Record<string, unknown>> {
    const query =
      typeof input.query === 'string' ? input.query.toLowerCase() : undefined;
    const type =
      typeof input.type === 'string'
        ? (input.type.toUpperCase() as never)
        : undefined;

    const targets = await this.targetsRepository.list({
      projectId: context.projectId,
      type,
    });
    const filtered = query
      ? targets.filter(
          (t) =>
            t.value.toLowerCase().includes(query) ||
            (t.name ?? '').toLowerCase().includes(query),
        )
      : targets;
    const limited = filtered.slice(0, 25);

    return {
      count: filtered.length,
      targets: limited.map((t) => ({
        id: t.id,
        type: t.type,
        value: t.value,
        name: t.name,
        scopeStatus: t.scopeStatus,
      })),
    };
  }
}
