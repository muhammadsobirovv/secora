import { Body, Controller, Get, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { IncidentInvestigationSessionDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { IncidentInvestigationService } from '../incident-investigation.service.js';
import { DecideIncidentInvestigationDto, StartIncidentInvestigationDto } from '../dto/incident-investigation.dto.js';

/// Module 17 — task #472 (AI Investigation Workflow, defensive lifecycle).
/// Resolves workspaceId from the authenticated caller via
/// `WorkspacesRepository.findPersonalWorkspaceForUser` — the same
/// enumeration-safe pattern every other Module 17 controller uses, never
/// from a client-supplied value. `start()`'s `incidentId` is a request
/// body field, but `IncidentInvestigationService.start()` independently
/// re-verifies it against this workspace via `IncidentsService
/// .getForWorkspace` before trusting it for anything.
@ApiTags('incident-investigation')
@ApiBearerAuth()
@Controller('incident-investigations')
export class IncidentInvestigationController {
  constructor(
    private readonly investigations: IncidentInvestigationService,
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
  @ApiOperation({ summary: "List this workspace's AI Investigation Workflow sessions" })
  async list(@CurrentUser() user: RequestUser): Promise<IncidentInvestigationSessionDto[]> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.investigations.listForWorkspace(workspaceId);
  }

  @Post()
  @ApiOperation({ summary: 'Start a new incident investigation workflow: composes a read-only plan and submits it for approval' })
  async start(
    @CurrentUser() user: RequestUser,
    @Body() dto: StartIncidentInvestigationDto,
  ): Promise<IncidentInvestigationSessionDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.investigations.start(user.id, workspaceId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an incident investigation session, its plan, and its steps' })
  async get(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<IncidentInvestigationSessionDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.investigations.getForWorkspace(id, workspaceId);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve or deny an investigation plan. Approving runs every step — each is a read-only lookup, never a tool execution.' })
  async approve(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: DecideIncidentInvestigationDto,
  ): Promise<IncidentInvestigationSessionDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.investigations.decide(id, workspaceId, user.id, dto.approve, dto.decisionNote);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel an investigation before it starts running' })
  async cancel(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<IncidentInvestigationSessionDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.investigations.cancel(id, workspaceId);
  }
}
