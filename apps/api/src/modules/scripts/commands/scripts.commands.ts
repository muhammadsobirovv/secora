import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type {
  CreateScriptDefinitionRequestDto,
  RunScriptRequestDto,
  ScriptDefinitionDto,
  ScriptExecutionDto,
  UpdateScriptDefinitionRequestDto,
} from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { ScriptEngineService } from '../script-engine.service.js';
import { ScriptsRepository } from '../scripts.repository.js';
import { toScriptDefinitionDto, toScriptExecutionDto } from '../mappers/to-script-dto.mapper.js';
import { MetricsRegistryService } from '../../observability/metrics-registry.service.js';

/// Module 13 — Script Engine commands (task #286). Same
/// "controller -> Command -> resolve personal workspace -> repository/
/// service" shape every other Module 13 write path uses (see
/// `agent-sdk.commands.ts`'s `resolveWorkspaceId`).
async function resolveWorkspaceId(workspacesRepository: WorkspacesRepository, userId: string): Promise<string> {
  const workspace = await workspacesRepository.findPersonalWorkspaceForUser(userId);
  if (!workspace) {
    throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
  }
  return workspace.id;
}

export class CreateScriptDefinitionCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: CreateScriptDefinitionRequestDto,
  ) {}
}

@CommandHandler(CreateScriptDefinitionCommand)
export class CreateScriptDefinitionHandler implements ICommandHandler<CreateScriptDefinitionCommand, ScriptDefinitionDto> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    private readonly repository: ScriptsRepository,
  ) {}

  async execute(command: CreateScriptDefinitionCommand): Promise<ScriptDefinitionDto> {
    const workspaceId = await resolveWorkspaceId(this.workspacesRepository, command.userId);
    const row = await this.repository.createDefinition({
      workspaceId,
      name: command.data.name,
      description: command.data.description ?? null,
      language: command.data.language,
      sourceCode: command.data.sourceCode,
      permissions: command.data.permissions,
      createdBy: command.userId,
    });
    return toScriptDefinitionDto(row);
  }
}

export class UpdateScriptDefinitionCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly scriptId: string,
    public readonly data: UpdateScriptDefinitionRequestDto,
  ) {}
}

@CommandHandler(UpdateScriptDefinitionCommand)
export class UpdateScriptDefinitionHandler implements ICommandHandler<UpdateScriptDefinitionCommand, ScriptDefinitionDto> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    private readonly repository: ScriptsRepository,
  ) {}

  async execute(command: UpdateScriptDefinitionCommand): Promise<ScriptDefinitionDto> {
    const workspaceId = await resolveWorkspaceId(this.workspacesRepository, command.userId);
    const row = await this.repository.updateDefinition(command.scriptId, workspaceId, command.data);
    if (!row) {
      throw new AppException('SCRIPT_DEFINITION_NOT_FOUND', 'Script not found.', HttpStatus.NOT_FOUND);
    }
    return toScriptDefinitionDto(row);
  }
}

export class DeleteScriptDefinitionCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly scriptId: string,
  ) {}
}

@CommandHandler(DeleteScriptDefinitionCommand)
export class DeleteScriptDefinitionHandler implements ICommandHandler<DeleteScriptDefinitionCommand, void> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    private readonly repository: ScriptsRepository,
  ) {}

  async execute(command: DeleteScriptDefinitionCommand): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.workspacesRepository, command.userId);
    const deleted = await this.repository.deleteDefinition(command.scriptId, workspaceId);
    if (!deleted) {
      throw new AppException('SCRIPT_DEFINITION_NOT_FOUND', 'Script not found.', HttpStatus.NOT_FOUND);
    }
  }
}

export class RunScriptCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly scriptId: string,
    public readonly data: RunScriptRequestDto,
  ) {}
}

@CommandHandler(RunScriptCommand)
export class RunScriptHandler implements ICommandHandler<RunScriptCommand, ScriptExecutionDto> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    private readonly repository: ScriptsRepository,
    private readonly engine: ScriptEngineService,
    private readonly metrics: MetricsRegistryService,
  ) {}

  async execute(command: RunScriptCommand): Promise<ScriptExecutionDto> {
    const workspaceId = await resolveWorkspaceId(this.workspacesRepository, command.userId);
    const definition = await this.repository.findDefinitionById(command.scriptId);
    if (!definition || definition.workspaceId !== workspaceId) {
      throw new AppException('SCRIPT_DEFINITION_NOT_FOUND', 'Script not found.', HttpStatus.NOT_FOUND);
    }

    const execution = await this.repository.createExecution({
      scriptDefinitionId: definition.id,
      workspaceId,
      input: command.data.input ?? null,
      triggeredBy: command.userId,
    });

    const startedAt = new Date();
    try {
      const result = await this.engine.run({
        language: definition.language,
        sourceCode: definition.sourceCode,
        permissions: definition.permissions,
        workspaceId,
        userId: command.userId,
        input: command.data.input ?? {},
      });
      await this.repository.finishExecution({
        id: execution.id,
        status: 'SUCCEEDED',
        output: result.output,
        logs: result.logs,
        errorMessage: null,
        durationMs: result.durationMs,
        startedAt,
      });
      this.metrics.scriptExecutionsTotal.inc({ status: 'SUCCEEDED' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isTimeout = message.includes('wall-clock budget');
      const status = isTimeout ? 'TIMEOUT' : 'FAILED';
      await this.repository.finishExecution({
        id: execution.id,
        status,
        output: null,
        logs: [],
        errorMessage: message,
        durationMs: Date.now() - startedAt.getTime(),
        startedAt,
      });
      this.metrics.scriptExecutionsTotal.inc({ status });
    }

    const finished = await this.repository.findExecutionById(execution.id);
    return toScriptExecutionDto(finished!);
  }
}

export { resolveWorkspaceId };
