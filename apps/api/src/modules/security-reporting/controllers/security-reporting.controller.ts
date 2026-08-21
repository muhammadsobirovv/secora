import { Body, Controller, Get, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { SecurityReportDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { SecurityReportingService } from '../security-reporting.service.js';
import { GenerateSecurityReportDto } from '../dto/security-reporting.dto.js';

/// Module 17 — task #481. Workspace resolution mirrors every other
/// Module 17 controller (see `ResearchSessionController`'s doc comment)
/// — never a client-supplied `workspaceId`, so one workspace can never
/// read or generate a report scoped to another.
@ApiTags('security-reporting')
@ApiBearerAuth()
@Controller('security-reports')
export class SecurityReportingController {
  constructor(
    private readonly reports: SecurityReportingService,
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
  @ApiOperation({ summary: "List this workspace's previously generated security reports" })
  async list(@CurrentUser() user: RequestUser): Promise<SecurityReportDto[]> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.reports.listForWorkspace(workspaceId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a generated security report' })
  async get(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<SecurityReportDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.reports.getForWorkspace(id, workspaceId);
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Generate a new security report (a point-in-time JSON snapshot composed from existing SOC data)',
  })
  async generate(@CurrentUser() user: RequestUser, @Body() dto: GenerateSecurityReportDto): Promise<SecurityReportDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.reports.generate(workspaceId, user.id, dto);
  }
}
