import { HttpStatus, Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { PlaybookApprovalDto, PlaybookExecutionDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  PLAYBOOK_EXECUTIONS_REPOSITORY,
  type PlaybookExecutionsRepository,
} from '../domain/repositories/playbook-executions.repository.interface.js';
import { toPlaybookApprovalDto, toPlaybookExecutionDto } from '../mappers/to-playbook-dto.mapper.js';

async function resolveWorkspace(workspacesRepository: WorkspacesRepository, userId: string): Promise<string> {
  const workspace = await workspacesRepository.findPersonalWorkspaceForUser(userId);
  if (!workspace) {
    throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
  }
  return workspace.id;
}

export class ListPlaybookExecutionsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly playbookId?: string,
  ) {}
}

@QueryHandler(ListPlaybookExecutionsQuery)
export class ListPlaybookExecutionsHandler
  implements IQueryHandler<ListPlaybookExecutionsQuery, PlaybookExecutionDto[]>
{
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PLAYBOOK_EXECUTIONS_REPOSITORY) private readonly executionsRepository: PlaybookExecutionsRepository,
  ) {}

  async execute(query: ListPlaybookExecutionsQuery): Promise<PlaybookExecutionDto[]> {
    const workspaceId = await resolveWorkspace(this.workspacesRepository, query.userId);
    const executions = await this.executionsRepository.listExecutions({ workspaceId, playbookId: query.playbookId });
    const dtos: PlaybookExecutionDto[] = [];
    for (const execution of executions) {
      const steps = await this.executionsRepository.listExecutionSteps(execution.id);
      dtos.push(toPlaybookExecutionDto(execution, steps));
    }
    return dtos;
  }
}

export class GetPlaybookExecutionQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly executionId: string,
  ) {}
}

@QueryHandler(GetPlaybookExecutionQuery)
export class GetPlaybookExecutionHandler implements IQueryHandler<GetPlaybookExecutionQuery, PlaybookExecutionDto> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PLAYBOOK_EXECUTIONS_REPOSITORY) private readonly executionsRepository: PlaybookExecutionsRepository,
  ) {}

  async execute(query: GetPlaybookExecutionQuery): Promise<PlaybookExecutionDto> {
    const workspaceId = await resolveWorkspace(this.workspacesRepository, query.userId);
    const execution = await this.executionsRepository.findExecutionByIdForWorkspace(query.executionId, workspaceId);
    if (!execution) {
      throw new AppException('PLAYBOOK_EXECUTION_NOT_FOUND', 'Playbook execution not found.', HttpStatus.NOT_FOUND);
    }
    const steps = await this.executionsRepository.listExecutionSteps(execution.id);
    return toPlaybookExecutionDto(execution, steps);
  }
}

export class ListPlaybookApprovalsQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

@QueryHandler(ListPlaybookApprovalsQuery)
export class ListPlaybookApprovalsHandler implements IQueryHandler<ListPlaybookApprovalsQuery, PlaybookApprovalDto[]> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PLAYBOOK_EXECUTIONS_REPOSITORY) private readonly executionsRepository: PlaybookExecutionsRepository,
  ) {}

  async execute(query: ListPlaybookApprovalsQuery): Promise<PlaybookApprovalDto[]> {
    const workspaceId = await resolveWorkspace(this.workspacesRepository, query.userId);
    const approvals = await this.executionsRepository.listApprovalsForWorkspace(workspaceId);
    return approvals.map(toPlaybookApprovalDto);
  }
}
