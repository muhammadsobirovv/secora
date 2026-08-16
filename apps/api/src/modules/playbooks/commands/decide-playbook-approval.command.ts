import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type { DecidePlaybookApprovalRequestDto, PlaybookApprovalDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  PLAYBOOK_EXECUTIONS_REPOSITORY,
  type PlaybookExecutionsRepository,
} from '../domain/repositories/playbook-executions.repository.interface.js';
import { SecurityApprovalService } from '../../security/security-approval.service.js';
import { PlaybookExecutionService } from '../playbook-execution.service.js';
import { toPlaybookApprovalDto } from '../mappers/to-playbook-dto.mapper.js';

/// Module 16 — Playbooks (task #389). A rejected approval must stop every
/// step reachable from the gated node ("dependent steps") — enforced here
/// by delegating to `PlaybookExecutionService.resumeAfterApproval`, which
/// walks the graph's descendants and marks each still-pending step
/// SKIPPED rather than silently leaving them PENDING forever. The decision
/// itself is recorded through the *same* `SecurityApprovalService.decide`
/// every other Module 16 approval-gated surface uses (Terminal, AI
/// Investigation) — this command never marks a `PlaybookApproval` APPROVED
/// on the strength of a client-supplied boolean alone.
export class DecidePlaybookApprovalCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly approvalId: string,
    public readonly data: DecidePlaybookApprovalRequestDto,
  ) {}
}

@CommandHandler(DecidePlaybookApprovalCommand)
export class DecidePlaybookApprovalHandler
  implements ICommandHandler<DecidePlaybookApprovalCommand, PlaybookApprovalDto>
{
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PLAYBOOK_EXECUTIONS_REPOSITORY) private readonly executionsRepository: PlaybookExecutionsRepository,
    private readonly securityApprovals: SecurityApprovalService,
    private readonly executionService: PlaybookExecutionService,
  ) {}

  async execute(command: DecidePlaybookApprovalCommand): Promise<PlaybookApprovalDto> {
    const workspace = await this.workspacesRepository.findPersonalWorkspaceForUser(command.userId);
    if (!workspace) {
      throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
    }
    const approval = await this.executionsRepository.findApprovalByIdForWorkspace(command.approvalId, workspace.id);
    if (!approval) {
      throw new AppException('PLAYBOOK_APPROVAL_REQUIRED', 'Playbook approval request not found.', HttpStatus.NOT_FOUND);
    }
    if (approval.status !== 'WAITING_APPROVAL') {
      throw new AppException(
        'PLAYBOOK_INVALID_STATE_TRANSITION',
        `This approval has already been decided (${approval.status}).`,
        HttpStatus.CONFLICT,
      );
    }

    if (approval.securityApprovalRequestId) {
      await this.securityApprovals.decide(
        approval.securityApprovalRequestId,
        workspace.id,
        command.userId,
        command.data.approve,
        command.data.decisionNote,
      );
    }

    const decided = await this.executionsRepository.decideApproval(approval.id, {
      status: command.data.approve ? 'APPROVED' : 'REJECTED',
      decidedBy: command.userId,
      decidedAt: new Date(),
    });

    const step = await this.executionsRepository.findExecutionStepById(approval.executionStepId);
    await this.executionsRepository.updateExecutionStep(approval.executionStepId, {
      status: command.data.approve ? 'COMPLETED' : 'FAILED',
      finishedAt: new Date(),
      ...(command.data.approve ? {} : { error: command.data.decisionNote ?? 'Approval rejected.' }),
    });

    if (step) {
      await this.executionService.resumeAfterApproval(approval.executionId, step.nodeId, command.data.approve);
    }

    return toPlaybookApprovalDto(decided);
  }
}
