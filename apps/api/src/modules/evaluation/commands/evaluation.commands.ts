import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type { EvaluationRunDto, RunEvaluationRequestDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { AiEvaluationService } from '../ai-evaluation.service.js';
import { MetricsRegistryService } from '../../observability/metrics-registry.service.js';

/// Module 13 — AI Evaluation commands (task #289). Same
/// "controller -> Command -> resolve personal workspace -> service"
/// shape as every other Module 13 write path.
export class RunEvaluationCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: RunEvaluationRequestDto,
  ) {}
}

@CommandHandler(RunEvaluationCommand)
export class RunEvaluationHandler implements ICommandHandler<RunEvaluationCommand, EvaluationRunDto> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    private readonly evaluationService: AiEvaluationService,
    private readonly metrics: MetricsRegistryService,
  ) {}

  async execute(command: RunEvaluationCommand): Promise<EvaluationRunDto> {
    const workspace = await this.workspacesRepository.findPersonalWorkspaceForUser(command.userId);
    if (!workspace) {
      throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
    }
    const result = await this.evaluationService.run({ workspaceId: workspace.id, userId: command.userId, data: command.data });
    this.metrics.evaluationRunsTotal.inc({ metricType: command.data.metricType });
    return result;
  }
}
