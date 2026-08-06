import { HttpStatus, Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { ListPendingRelayCommandsQueryDto, RelayCommandDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { RelayCommandsRepository } from '../relay-commands.repository.js';
import { toRelayCommandDto } from '../to-relay-command-dto.mapper.js';

/// Module 13 — Local Execution (task #288). Polled by a connected
/// Desktop Agent / Browser Extension session — see
/// `RelayCommandsRepository.claimPending`'s doc comment for the
/// claim-on-read semantics.
export class ListPendingRelayCommandsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly filter: ListPendingRelayCommandsQueryDto,
  ) {}
}

@QueryHandler(ListPendingRelayCommandsQuery)
export class ListPendingRelayCommandsHandler
  implements IQueryHandler<ListPendingRelayCommandsQuery, RelayCommandDto[]>
{
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    private readonly repository: RelayCommandsRepository,
  ) {}

  async execute(query: ListPendingRelayCommandsQuery): Promise<RelayCommandDto[]> {
    const workspace = await this.workspacesRepository.findPersonalWorkspaceForUser(query.userId);
    if (!workspace) {
      throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
    }
    const rows = await this.repository.claimPending(workspace.id, query.filter.target, query.filter.limit ?? 20);
    return rows.map(toRelayCommandDto);
  }
}
