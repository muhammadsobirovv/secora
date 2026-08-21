import { Controller, Get, HttpStatus, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SecurityMetricsSummaryDto, SecurityMetricsTrendPointDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { SecurityMetricsService } from '../security-metrics.service.js';
import { SecurityMetricsSummaryQueryDto, SecurityMetricsTrendQueryDto } from '../dto/security-metrics.dto.js';

/// Module 17 — task #479 (Security Metrics, spec section 24). Workspace
/// resolution mirrors every other Module 17 controller — see
/// `ResearchSessionController`'s doc comment.
@ApiTags('security-metrics')
@ApiBearerAuth()
@Controller('security-metrics')
export class SecurityMetricsController {
  constructor(
    private readonly metrics: SecurityMetricsService,
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

  @Get('summary')
  @ApiOperation({ summary: 'MTTD/MTTR/MTTV/SLA-compliance summary for this workspace (see field docs for exact proxies used)' })
  async summary(@CurrentUser() user: RequestUser, @Query() query: SecurityMetricsSummaryQueryDto): Promise<SecurityMetricsSummaryDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.metrics.summary(workspaceId, query.windowDays);
  }

  @Get('trend')
  @ApiOperation({ summary: 'Weekly MTTR/SLA-compliance trend for this workspace' })
  async trend(@CurrentUser() user: RequestUser, @Query() query: SecurityMetricsTrendQueryDto): Promise<SecurityMetricsTrendPointDto[]> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.metrics.trend(workspaceId, query.weeks);
  }
}
