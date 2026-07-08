import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type { ActivityEventDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  ACTIVITY_REPOSITORY,
  type ActivityRepository,
} from '../domain/repositories/activity.repository.interface.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export class ListActivityQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly projectId?: string,
    public readonly cursor?: string,
    public readonly limit?: number,
  ) {}
}

@QueryHandler(ListActivityQuery)
export class ListActivityHandler implements IQueryHandler<
  ListActivityQuery,
  ActivityEventDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(ACTIVITY_REPOSITORY)
    private readonly activityRepository: ActivityRepository,
  ) {}

  async execute(query: ListActivityQuery): Promise<ActivityEventDto[]> {
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
    const events = await this.activityRepository.list({
      workspaceId: workspace.id,
      projectId: query.projectId,
      cursor: query.cursor,
      limit: Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT),
    });
    return events.map((event) => ({
      id: event.id,
      workspaceId: event.workspaceId,
      projectId: event.projectId,
      actorUserId: event.actorUserId,
      verb: event.verb,
      entityType: event.entityType,
      entityId: event.entityId,
      metadata: (event.metadata as Record<string, unknown> | null) ?? null,
      createdAt: event.createdAt.toISOString(),
    }));
  }
}
