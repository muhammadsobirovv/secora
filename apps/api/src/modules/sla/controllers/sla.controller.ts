import { Body, Controller, Get, HttpStatus, Inject, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SlaEventDto, SlaPolicyDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { SlaService } from '../sla.service.js';
import { ListSlaEventsQueryDto, UpsertSlaPolicyDto } from '../dto/sla.dto.js';

/// Module 17 — task #478 (SLA Engine, spec section 23). Workspace
/// resolution mirrors every other Module 17 controller — see
/// `ResearchSessionController`'s doc comment.
@ApiTags('sla')
@ApiBearerAuth()
@Controller('sla')
export class SlaController {
  constructor(
    private readonly sla: SlaService,
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

  @Get('policies')
  @ApiOperation({ summary: "List this workspace's SLA policies (target hours per severity)" })
  async listPolicies(@CurrentUser() user: RequestUser): Promise<SlaPolicyDto[]> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.sla.listPolicies(workspaceId);
  }

  @Post('policies')
  @ApiOperation({ summary: 'Create or update this workspace SLA policy for a severity level' })
  async upsertPolicy(@CurrentUser() user: RequestUser, @Body() dto: UpsertSlaPolicyDto): Promise<SlaPolicyDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.sla.upsertPolicy(workspaceId, dto.severity, dto.targetHours);
  }

  @Get('events')
  @ApiOperation({ summary: 'List SLA clock events (STARTED/BREACHED/RESOLVED) for this workspace' })
  async listEvents(@CurrentUser() user: RequestUser, @Query() query: ListSlaEventsQueryDto): Promise<SlaEventDto[]> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.sla.listEventsForWorkspace(workspaceId, query);
  }
}
