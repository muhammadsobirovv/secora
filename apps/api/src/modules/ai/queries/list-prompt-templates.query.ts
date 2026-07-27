import { HttpStatus, Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { ListPromptTemplatesQueryDto, PromptTemplateDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  PROMPT_TEMPLATE_REPOSITORY,
  type PromptTemplateRepository,
} from '../domain/repositories/prompt-template.repository.interface.js';
import { toPromptTemplateDto } from '../mappers/to-prompt-template-dto.mapper.js';

export class ListPromptTemplatesQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly filter: ListPromptTemplatesQueryDto,
  ) {}
}

@QueryHandler(ListPromptTemplatesQuery)
export class ListPromptTemplatesHandler implements IQueryHandler<
  ListPromptTemplatesQuery,
  PromptTemplateDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROMPT_TEMPLATE_REPOSITORY)
    private readonly promptTemplatesRepository: PromptTemplateRepository,
  ) {}

  async execute(query: ListPromptTemplatesQuery): Promise<PromptTemplateDto[]> {
    const workspace = await this.workspacesRepository.findPersonalWorkspaceForUser(
      query.userId,
    );
    if (!workspace) {
      throw new AppException(
        'WORKSPACE_NOT_FOUND',
        'Workspace not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const records = await this.promptTemplatesRepository.list({
      workspaceId: workspace.id,
      category: query.filter.category,
      search: query.filter.search,
    });
    return records.map(toPromptTemplateDto);
  }
}
