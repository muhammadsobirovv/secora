import { Body, Controller, Delete, Get, HttpStatus, Inject, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { MonitoringJobDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { ContinuousMonitoringService } from '../continuous-monitoring.service.js';
import { CreateMonitoringJobDto, UpdateMonitoringJobDto } from '../dto/monitoring.dto.js';

/// Module 17 — task #463 (Continuous Attack Surface Monitoring).
/// Workspace resolution mirrors every other Module 17 controller — see
/// `ResearchSessionController`'s doc comment for the rationale.
@ApiTags('monitoring')
@ApiBearerAuth()
@Controller('monitoring/jobs')
export class MonitoringController {
  constructor(
    private readonly monitoring: ContinuousMonitoringService,
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
  @ApiOperation({ summary: "List this workspace's continuous monitoring policies" })
  async list(@CurrentUser() user: RequestUser): Promise<MonitoringJobDto[]> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.monitoring.listForWorkspace(workspaceId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a continuous monitoring policy for a target' })
  async create(@CurrentUser() user: RequestUser, @Body() dto: CreateMonitoringJobDto): Promise<MonitoringJobDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.monitoring.create(workspaceId, user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a monitoring policy' })
  async get(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<MonitoringJobDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.monitoring.getForWorkspace(id, workspaceId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Enable/disable a monitoring policy or change its schedule' })
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateMonitoringJobDto,
  ): Promise<MonitoringJobDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.monitoring.update(id, workspaceId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a monitoring policy' })
  async remove(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<{ ok: true }> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    await this.monitoring.delete(id, workspaceId);
    return { ok: true };
  }

  @Post(':id/trigger')
  @ApiOperation({ summary: 'Trigger this monitoring policy immediately (dispatches a real Recon job)' })
  async trigger(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<MonitoringJobDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.monitoring.triggerNow(id, user.id, workspaceId);
  }
}
