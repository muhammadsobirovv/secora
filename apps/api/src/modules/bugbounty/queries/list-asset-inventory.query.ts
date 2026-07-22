import { HttpStatus, Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type {
  AssetInventoryEntryDto,
  AssetInventoryQueryDto,
} from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  PROJECTS_REPOSITORY,
  type ProjectsRepository,
} from '../../projects/domain/repositories/projects.repository.interface.js';
import {
  resolveBugBountyProgramForCaller,
  resolveWorkspaceForCaller,
} from '../authorization.util.js';
import {
  BUGBOUNTY_PROGRAMS_REPOSITORY,
  type BugBountyProgramsRepository,
} from '../domain/repositories/bugbounty-programs.repository.interface.js';
import { AssetInventoryService } from '../asset-inventory/asset-inventory.service.js';

export class ListAssetInventoryQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly filter: AssetInventoryQueryDto,
  ) {}
}

/// Thin authorization + dispatch layer in front of AssetInventoryService —
/// same split as every other query handler in this module (auth here,
/// aggregation logic in a dedicated service since it fans out across five
/// other modules' repositories and would bloat the handler).
@QueryHandler(ListAssetInventoryQuery)
export class ListAssetInventoryHandler implements IQueryHandler<
  ListAssetInventoryQuery,
  AssetInventoryEntryDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(BUGBOUNTY_PROGRAMS_REPOSITORY)
    private readonly programsRepository: BugBountyProgramsRepository,
    private readonly assetInventoryService: AssetInventoryService,
  ) {}

  async execute(
    query: ListAssetInventoryQuery,
  ): Promise<AssetInventoryEntryDto[]> {
    let workspaceId: string;

    if (query.filter.programId) {
      ({ workspaceId } = await resolveBugBountyProgramForCaller(
        this.workspacesRepository,
        this.programsRepository,
        query.userId,
        query.filter.programId,
      ));
    } else {
      const workspace = await resolveWorkspaceForCaller(
        this.workspacesRepository,
        query.userId,
      );
      workspaceId = workspace.id;

      if (query.filter.projectId) {
        const project = await this.projectsRepository.findByIdForWorkspace(
          query.filter.projectId,
          workspaceId,
        );
        if (!project) {
          throw new AppException(
            'PROJECT_NOT_FOUND',
            'Project not found.',
            HttpStatus.NOT_FOUND,
          );
        }
      }
    }

    return this.assetInventoryService.list(workspaceId, query.filter);
  }
}
