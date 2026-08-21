import { Body, Controller, Get, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PlaybookExecutionDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { IncidentPlaybooksService } from '../incident-playbooks.service.js';
import { RunPlaybookAgainstIncidentDto } from '../dto/incident-playbooks.dto.js';

/// Module 17 — task #473 (Defensive Security Playbooks). Same
/// workspace-resolution pattern as every other Module 17 controller —
/// `WorkspacesRepository.findPersonalWorkspaceForUser`, never a
/// client-supplied `workspaceId`. Mounted at its own top-level prefix
/// (not nested under `/incidents/` or `/playbooks/`) for the same
/// route-collision-avoidance reason documented on
/// `IncidentInvestigationController` (task #472).
@ApiTags('incident-playbooks')
@ApiBearerAuth()
@Controller('incident-playbooks')
export class IncidentPlaybooksController {
  constructor(
    private readonly incidentPlaybooks: IncidentPlaybooksService,
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

  @Post('run')
  @ApiOperation({
    summary:
      'Run an existing playbook against an incident: resolves a Target from one of the incident\'s linked assets and starts the unmodified Playbook engine execution',
  })
  async run(
    @CurrentUser() user: RequestUser,
    @Body() dto: RunPlaybookAgainstIncidentDto,
  ): Promise<PlaybookExecutionDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.incidentPlaybooks.runAgainstIncident(user.id, workspaceId, dto.incidentId, dto.playbookId, dto.variableValues);
  }

  @Get(':incidentId')
  @ApiOperation({ summary: 'List playbook executions that have been run against this incident' })
  async listForIncident(
    @CurrentUser() user: RequestUser,
    @Param('incidentId') incidentId: string,
  ): Promise<PlaybookExecutionDto[]> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.incidentPlaybooks.listForIncident(incidentId, workspaceId);
  }
}
