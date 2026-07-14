import { Inject, Injectable } from '@nestjs/common';
import {
  PROJECTS_REPOSITORY,
  type ProjectsRepository,
} from '../../projects/domain/repositories/projects.repository.interface.js';
import type { AiTool, AiToolContext } from './ai-tool.interface.js';

/// Searches across the whole workspace (not just the current project) —
/// deliberately the one search_* tool scoped wider than `context.projectId`,
/// since "which other projects do we have" is a workspace-level question.
/// Still workspace-isolated (Security: Workspace Isolation): only ever
/// queries `context.workspaceId`, never a caller-supplied one.
@Injectable()
export class SearchProjectsTool implements AiTool {
  readonly name = 'search_projects' as const;
  readonly description =
    'Search projects in the current workspace by name. Input: { query?: string, status?: string }.';

  constructor(
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
  ) {}

  async execute(
    input: Record<string, unknown>,
    context: AiToolContext,
  ): Promise<Record<string, unknown>> {
    const query =
      typeof input.query === 'string' ? input.query.toLowerCase() : undefined;
    const status =
      typeof input.status === 'string'
        ? (input.status.toUpperCase() as never)
        : undefined;

    const projects = await this.projectsRepository.list({
      workspaceId: context.workspaceId,
      status,
    });
    const filtered = query
      ? projects.filter((p) => p.name.toLowerCase().includes(query))
      : projects;
    const limited = filtered.slice(0, 15);

    return {
      count: filtered.length,
      projects: limited.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
      })),
    };
  }
}
