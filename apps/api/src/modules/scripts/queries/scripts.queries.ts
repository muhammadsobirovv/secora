import { HttpStatus, Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { ListScriptExecutionsQueryDto, ScriptDefinitionDto, ScriptExecutionDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { ScriptsRepository } from '../scripts.repository.js';
import { toScriptDefinitionDto, toScriptExecutionDto } from '../mappers/to-script-dto.mapper.js';

export class ListScriptDefinitionsQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

@QueryHandler(ListScriptDefinitionsQuery)
export class ListScriptDefinitionsHandler implements IQueryHandler<ListScriptDefinitionsQuery, ScriptDefinitionDto[]> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    private readonly repository: ScriptsRepository,
  ) {}

  async execute(query: ListScriptDefinitionsQuery): Promise<ScriptDefinitionDto[]> {
    const workspace = await this.workspacesRepository.findPersonalWorkspaceForUser(query.userId);
    if (!workspace) {
      throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
    }
    const rows = await this.repository.listDefinitions(workspace.id);
    return rows.map(toScriptDefinitionDto);
  }
}

export class GetScriptDefinitionQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly scriptId: string,
  ) {}
}

@QueryHandler(GetScriptDefinitionQuery)
export class GetScriptDefinitionHandler implements IQueryHandler<GetScriptDefinitionQuery, ScriptDefinitionDto> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    private readonly repository: ScriptsRepository,
  ) {}

  async execute(query: GetScriptDefinitionQuery): Promise<ScriptDefinitionDto> {
    const workspace = await this.workspacesRepository.findPersonalWorkspaceForUser(query.userId);
    if (!workspace) {
      throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
    }
    const row = await this.repository.findDefinitionById(query.scriptId);
    if (!row || row.workspaceId !== workspace.id) {
      throw new AppException('SCRIPT_DEFINITION_NOT_FOUND', 'Script not found.', HttpStatus.NOT_FOUND);
    }
    return toScriptDefinitionDto(row);
  }
}

export class ListScriptExecutionsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly scriptId: string,
    public readonly filter: ListScriptExecutionsQueryDto,
  ) {}
}

@QueryHandler(ListScriptExecutionsQuery)
export class ListScriptExecutionsHandler implements IQueryHandler<ListScriptExecutionsQuery, ScriptExecutionDto[]> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    private readonly repository: ScriptsRepository,
  ) {}

  async execute(query: ListScriptExecutionsQuery): Promise<ScriptExecutionDto[]> {
    const workspace = await this.workspacesRepository.findPersonalWorkspaceForUser(query.userId);
    if (!workspace) {
      throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
    }
    const definition = await this.repository.findDefinitionById(query.scriptId);
    if (!definition || definition.workspaceId !== workspace.id) {
      throw new AppException('SCRIPT_DEFINITION_NOT_FOUND', 'Script not found.', HttpStatus.NOT_FOUND);
    }
    const rows = await this.repository.listExecutions({
      scriptDefinitionId: definition.id,
      status: query.filter.status,
      limit: query.filter.limit ?? 50,
    });
    return rows.map(toScriptExecutionDto);
  }
}

export class GetScriptExecutionQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly scriptId: string,
    public readonly executionId: string,
  ) {}
}

@QueryHandler(GetScriptExecutionQuery)
export class GetScriptExecutionHandler implements IQueryHandler<GetScriptExecutionQuery, ScriptExecutionDto> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    private readonly repository: ScriptsRepository,
  ) {}

  async execute(query: GetScriptExecutionQuery): Promise<ScriptExecutionDto> {
    const workspace = await this.workspacesRepository.findPersonalWorkspaceForUser(query.userId);
    if (!workspace) {
      throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
    }
    const execution = await this.repository.findExecutionById(query.executionId);
    if (!execution || execution.scriptDefinitionId !== query.scriptId || execution.workspaceId !== workspace.id) {
      throw new AppException('SCRIPT_EXECUTION_NOT_FOUND', 'Script execution not found.', HttpStatus.NOT_FOUND);
    }
    return toScriptExecutionDto(execution);
  }
}
