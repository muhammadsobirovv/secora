import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type { WorkspaceDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../domain/repositories/workspaces.repository.interface.js';
import { toWorkspaceDto } from '../mappers/to-workspace-dto.mapper.js';

export class GetWorkspaceQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

@QueryHandler(GetWorkspaceQuery)
export class GetWorkspaceHandler implements IQueryHandler<
  GetWorkspaceQuery,
  WorkspaceDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  async execute(query: GetWorkspaceQuery): Promise<WorkspaceDto> {
    const workspace =
      await this.workspacesRepository.findPersonalWorkspaceForUser(
        query.userId,
      );
    if (!workspace) {
      throw new AppException(
        'WORKSPACE_NOT_FOUND',
        'Workspace not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return toWorkspaceDto(workspace);
  }
}
