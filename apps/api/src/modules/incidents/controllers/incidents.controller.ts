import { Body, Controller, Get, HttpStatus, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { IncidentDto, IncidentTimelineEventDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { IncidentsService } from '../incidents.service.js';
import {
  AddIncidentTimelineNoteDto,
  AssignIncidentDto,
  CreateIncidentDto,
  LinkIncidentAssetDto,
  LinkIncidentEvidenceDto,
  LinkIncidentFindingDto,
  LinkIncidentIndicatorDto,
  LinkIncidentResearchSessionDto,
  ListIncidentsQueryDto,
  UpdateIncidentStatusDto,
} from '../dto/incident.dto.js';

/// Module 17 — task #470 (Incident Management, spec sections 11-13).
/// Resolves the caller's workspace from `userId` — same sole resolution
/// path every Module 16/17 controller uses (see
/// `ResearchSessionController`'s doc comment) — rather than trusting a
/// client-supplied `workspaceId`, so one authenticated user can never
/// read or mutate another workspace's incidents by guessing an id.
@ApiTags('incidents')
@ApiBearerAuth()
@Controller('incidents')
export class IncidentsController {
  constructor(
    private readonly incidents: IncidentsService,
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
  @ApiOperation({ summary: "List this workspace's incidents" })
  async list(
    @CurrentUser() user: RequestUser,
    @Query() query: ListIncidentsQueryDto,
  ): Promise<IncidentDto[]> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.incidents.listForWorkspace(workspaceId, query);
  }

  @Post()
  @ApiOperation({ summary: 'Open a new security incident' })
  async create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateIncidentDto,
  ): Promise<IncidentDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.incidents.create(workspaceId, user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an incident' })
  async get(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<IncidentDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.incidents.getForWorkspace(id, workspaceId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Change incident status (lifecycle transition, recorded on the timeline)' })
  async updateStatus(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateIncidentStatusDto,
  ): Promise<IncidentDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.incidents.updateStatus(id, workspaceId, user.id, dto.status, dto.reason);
  }

  @Patch(':id/assign')
  @ApiOperation({ summary: 'Assign or unassign an incident' })
  async assign(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: AssignIncidentDto,
  ): Promise<IncidentDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.incidents.assign(id, workspaceId, user.id, dto.assigneeId);
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Get the immutable incident timeline' })
  async listTimeline(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<IncidentTimelineEventDto[]> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.incidents.listTimeline(id, workspaceId);
  }

  @Post(':id/timeline/notes')
  @ApiOperation({ summary: 'Append a free-text note to the timeline (structured discussion belongs on /comments)' })
  async addNote(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: AddIncidentTimelineNoteDto,
  ): Promise<IncidentTimelineEventDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.incidents.addNote(id, workspaceId, user.id, dto.description);
  }

  @Post(':id/links/assets')
  @ApiOperation({ summary: 'Link an asset-graph node to this incident' })
  async linkAsset(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: LinkIncidentAssetDto,
  ): Promise<{ ok: true }> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    await this.incidents.linkAsset(id, workspaceId, user.id, dto.targetId, dto.nodeType, dto.refId);
    return { ok: true };
  }

  @Post(':id/links/findings')
  @ApiOperation({ summary: 'Link a bug-bounty finding to this incident' })
  async linkFinding(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: LinkIncidentFindingDto,
  ): Promise<{ ok: true }> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    await this.incidents.linkFinding(id, workspaceId, user.id, dto.findingId);
    return { ok: true };
  }

  @Post(':id/links/indicators')
  @ApiOperation({ summary: 'Link a threat indicator to this incident' })
  async linkIndicator(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: LinkIncidentIndicatorDto,
  ): Promise<{ ok: true }> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    await this.incidents.linkIndicator(id, workspaceId, user.id, dto.indicatorId);
    return { ok: true };
  }

  @Post(':id/links/evidence')
  @ApiOperation({ summary: 'Link evidence to this incident' })
  async linkEvidence(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: LinkIncidentEvidenceDto,
  ): Promise<{ ok: true }> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    await this.incidents.linkEvidence(id, workspaceId, user.id, dto.evidenceId);
    return { ok: true };
  }

  @Post(':id/links/research-sessions')
  @ApiOperation({ summary: 'Link a research session (AI investigation trail) to this incident' })
  async linkResearchSession(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: LinkIncidentResearchSessionDto,
  ): Promise<{ ok: true }> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    await this.incidents.linkResearchSession(id, workspaceId, user.id, dto.sessionId);
    return { ok: true };
  }
}
