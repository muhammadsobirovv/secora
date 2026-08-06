import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type { CompleteRelayCommandRequestDto, RelayCommandDto, RelayCommandTarget } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { RelayCommandsRepository } from '../relay-commands.repository.js';
import { toRelayCommandDto } from '../to-relay-command-dto.mapper.js';
import { MetricsRegistryService } from '../../observability/metrics-registry.service.js';

/// Module 13 — Local Execution (task #288). `EnqueueRelayCommandCommand`
/// is the real persistence behind `McpToolRegistryService`'s
/// `desktop_agent_command`/`browser_extension_command` tools — see
/// `RelayCommand`'s Prisma doc comment for the full design and the
/// disclosed client-side gap.
export class EnqueueRelayCommandCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly target: RelayCommandTarget,
    public readonly commandType: string,
    public readonly payload: Record<string, unknown>,
  ) {}
}

@CommandHandler(EnqueueRelayCommandCommand)
export class EnqueueRelayCommandHandler implements ICommandHandler<EnqueueRelayCommandCommand, RelayCommandDto> {
  constructor(
    private readonly repository: RelayCommandsRepository,
    private readonly metrics: MetricsRegistryService,
  ) {}

  async execute(command: EnqueueRelayCommandCommand): Promise<RelayCommandDto> {
    const row = await this.repository.create({
      workspaceId: command.workspaceId,
      target: command.target,
      commandType: command.commandType,
      payload: command.payload,
      createdBy: command.userId,
    });
    this.metrics.relayCommandsTotal.inc({ target: command.target, status: 'ENQUEUED' });
    return toRelayCommandDto(row);
  }
}

export class CompleteRelayCommandCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly commandId: string,
    public readonly data: CompleteRelayCommandRequestDto,
  ) {}
}

@CommandHandler(CompleteRelayCommandCommand)
export class CompleteRelayCommandHandler implements ICommandHandler<CompleteRelayCommandCommand, RelayCommandDto> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    private readonly repository: RelayCommandsRepository,
    private readonly metrics: MetricsRegistryService,
  ) {}

  async execute(command: CompleteRelayCommandCommand): Promise<RelayCommandDto> {
    const workspace = await this.workspacesRepository.findPersonalWorkspaceForUser(command.userId);
    if (!workspace) {
      throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
    }
    const status = command.data.success ? 'COMPLETED' : 'FAILED';
    const row = await this.repository.complete({
      id: command.commandId,
      workspaceId: workspace.id,
      status,
      result: command.data.success ? command.data.result : { errorMessage: command.data.errorMessage },
    });
    if (!row) {
      throw new AppException('RELAY_COMMAND_NOT_FOUND', 'Relay command not found.', HttpStatus.NOT_FOUND);
    }
    this.metrics.relayCommandsTotal.inc({ target: row.target, status });
    return toRelayCommandDto(row);
  }
}
