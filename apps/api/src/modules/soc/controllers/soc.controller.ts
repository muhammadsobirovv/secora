import { Controller, Get, HttpStatus, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SocDashboardSummaryDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { SocService } from '../soc.service.js';
import { SocDashboardQueryDto } from '../dto/soc.dto.js';

/// Module 17 — REST API task #489. Previously `/soc` had no backend
/// route at all — the web app's `/soc` page composed the same data from
/// four separate calls (`/incidents`, `/sla/events`, `/intel/indicators`,
/// implicitly `/security-metrics/summary` on the sibling
/// `/executive-security` page). This controller is the single
/// documented, Swagger-visible endpoint the task title requires; the
/// frontend migrating onto it is a separate follow-up (same
/// "existing endpoint remains source of truth until migrated" posture
/// `GlobalSearchQuery`'s doc comment already established for `/search`
/// vs `/search/global`), not required by this task.
///
/// Workspace resolution mirrors every other Module 17 controller — see
/// `ResearchSessionController`'s doc comment.
@ApiTags('soc')
@ApiBearerAuth()
@Controller('soc')
export class SocController {
  constructor(
    private readonly soc: SocService,
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

  @Get('dashboard')
  @ApiOperation({
    summary:
      'Composed SOC dashboard summary for this workspace: open/critical incident counts, recent incidents, breached SLA events, active indicator count, and MTTD/MTTR/MTTV/SLA-compliance metrics',
  })
  async dashboard(@CurrentUser() user: RequestUser, @Query() query: SocDashboardQueryDto): Promise<SocDashboardSummaryDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.soc.dashboard(workspaceId, query.windowDays);
  }
}
