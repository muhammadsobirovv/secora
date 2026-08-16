import { Body, Controller, Get, HttpStatus, Inject, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { GlobalSecurityPolicyDto, SecurityApprovalRequestDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { SecurityApprovalService } from '../security-approval.service.js';
import { GlobalSecurityPolicyService } from '../global-security-policy.service.js';
import {
  CreateSecurityApprovalDto,
  DecideSecurityApprovalDto,
  UpdateGlobalSecurityPolicyDto,
} from '../dto/create-security-approval.dto.js';

/// Module 16 — Approval gates + Global Security Policy (tasks #399-400).
/// Resolves the caller's workspace from `userId` via
/// `WorkspacesRepository.findPersonalWorkspaceForUser` — the sole
/// resolution path every Project/Target/Note/... command in this codebase
/// uses (see that interface's doc comment) — rather than trusting a
/// client-supplied `workspaceId` query param, which would let one
/// authenticated user read or decide another workspace's approval
/// requests, or read/mutate another workspace's security policy, by
/// guessing/supplying an arbitrary id. (An earlier version of this
/// controller had that exact gap; fixed before any caller depended on the
/// query-param shape.) This codebase still has no deployment-wide
/// platform-admin role, so "manage this workspace's security policy"
/// remains gated the same pragmatic way every other workspace-owner-only
/// surface is: authenticated + "it's your own workspace," not role-checked
/// beyond that — see `docs/architecture/global-security-policy.md`.
@ApiTags('security')
@ApiBearerAuth()
@Controller('security')
export class SecurityController {
  constructor(
    private readonly approvals: SecurityApprovalService,
    private readonly policy: GlobalSecurityPolicyService,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  private async resolveWorkspaceId(userId: string): Promise<string> {
    const workspace =
      await this.workspacesRepository.findPersonalWorkspaceForUser(userId);
    if (!workspace) {
      throw new AppException(
        'WORKSPACE_NOT_FOUND',
        'Workspace not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return workspace.id;
  }

  @Get('approvals')
  @ApiOperation({ summary: "List this workspace's approval requests" })
  async list(@CurrentUser() user: RequestUser): Promise<SecurityApprovalRequestDto[]> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.approvals.listForWorkspace(workspaceId);
  }

  @Post('approvals')
  @ApiOperation({ summary: 'Request approval for a high-risk operation' })
  async create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateSecurityApprovalDto,
  ): Promise<SecurityApprovalRequestDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.approvals.create(workspaceId, user.id, dto);
  }

  @Patch('approvals/:id/decide')
  @ApiOperation({ summary: 'Approve or deny a pending approval request' })
  async decide(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: DecideSecurityApprovalDto,
  ): Promise<SecurityApprovalRequestDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.approvals.decide(id, workspaceId, user.id, dto.approve, dto.decisionNote);
  }

  @Get('policy')
  @ApiOperation({ summary: "Get this workspace's Global Security Policy (safe defaults if unset)" })
  async getPolicy(@CurrentUser() user: RequestUser): Promise<GlobalSecurityPolicyDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.policy.getForWorkspace(workspaceId);
  }

  @Patch('policy')
  @ApiOperation({ summary: "Update this workspace's Global Security Policy" })
  async updatePolicy(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateGlobalSecurityPolicyDto,
  ): Promise<GlobalSecurityPolicyDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.policy.update(workspaceId, user.id, dto);
  }
}
