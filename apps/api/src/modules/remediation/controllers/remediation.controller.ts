import { Body, Controller, Get, HttpStatus, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FindingVerificationDto, RemediationEvidenceLinkDto, RemediationTaskDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { RemediationService } from '../remediation.service.js';
import { FindingVerificationService } from '../finding-verification.service.js';
import {
  CreateRemediationTaskDto,
  LinkRemediationEvidenceDto,
  ListRemediationTasksQueryDto,
  UpdateFindingVerificationDto,
  UpdateRemediationTaskDto,
  UpdateRemediationTaskStatusDto,
} from '../dto/remediation.dto.js';

/// Module 17 — task #477 (Remediation tracking & verification, spec
/// sections 21-22). Two resources share this file because they're the two
/// halves of one workflow: a `RemediationTask` is the project-management
/// wrapper (owner/priority/due date), while a finding's own
/// `verificationStatus` is the "was the fix actually proven" claim the
/// task's CLOSED transition depends on (see `RemediationService.setStatus`
/// and `FindingVerificationService`). Workspace resolution mirrors every
/// other Module 17 controller — see `ResearchSessionController`'s doc
/// comment.
@ApiTags('remediation')
@ApiBearerAuth()
@Controller('remediation/tasks')
export class RemediationController {
  constructor(
    private readonly remediation: RemediationService,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  private async resolveWorkspaceId(userId: string): Promise<string> {
    const workspace = await this.workspacesRepository.findPersonalWorkspaceForUser(userId);
    if (!workspace) {
      throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
    }
    return workspace.id;
  }

  @Get()
  @ApiOperation({ summary: "List this workspace's remediation tasks" })
  async list(@CurrentUser() user: RequestUser, @Query() query: ListRemediationTasksQueryDto): Promise<RemediationTaskDto[]> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.remediation.listForWorkspace(workspaceId, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a remediation task' })
  async create(@CurrentUser() user: RequestUser, @Body() dto: CreateRemediationTaskDto): Promise<RemediationTaskDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.remediation.create(workspaceId, user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a remediation task' })
  async get(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<RemediationTaskDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.remediation.getForWorkspace(id, workspaceId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a remediation task (owner/team/priority/dueDate/notes)' })
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateRemediationTaskDto,
  ): Promise<RemediationTaskDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.remediation.update(id, workspaceId, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Change a remediation task status (CLOSED is rejected for finding-linked tasks whose finding is not yet VERIFIED)' })
  async setStatus(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateRemediationTaskStatusDto,
  ): Promise<RemediationTaskDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.remediation.setStatus(id, workspaceId, user.id, dto.status);
  }

  @Post(':id/evidence')
  @ApiOperation({ summary: 'Link evidence to a remediation task' })
  async linkEvidence(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: LinkRemediationEvidenceDto,
  ): Promise<RemediationEvidenceLinkDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.remediation.linkEvidence(id, workspaceId, user.id, dto.evidenceId);
  }

  @Get(':id/evidence')
  @ApiOperation({ summary: 'List evidence linked to a remediation task' })
  async listEvidence(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<RemediationEvidenceLinkDto[]> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.remediation.listEvidence(id, workspaceId);
  }
}

/// Separate controller (distinct top-level `/findings` prefix, no other
/// controller currently registers a bare `findings` prefix — bug-bounty's
/// own findings controller is mounted at `bugbounty/findings`) so the
/// finding-verification lifecycle has its own clear resource path rather
/// than being nested awkwardly under `/remediation`.
@ApiTags('remediation')
@ApiBearerAuth()
@Controller('findings')
export class FindingVerificationController {
  constructor(
    private readonly verification: FindingVerificationService,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  private async resolveWorkspaceId(userId: string): Promise<string> {
    const workspace = await this.workspacesRepository.findPersonalWorkspaceForUser(userId);
    if (!workspace) {
      throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
    }
    return workspace.id;
  }

  @Get(':id/verification')
  @ApiOperation({ summary: "Get a finding's verification status" })
  async get(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<FindingVerificationDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.verification.get(id, workspaceId);
  }

  @Patch(':id/verification')
  @ApiOperation({ summary: 'Update a finding verification status (VERIFIED requires real linked evidence)' })
  async setVerification(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateFindingVerificationDto,
  ): Promise<FindingVerificationDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.verification.setVerification(id, workspaceId, user.id, dto.status, dto.verificationEvidenceId);
  }
}
