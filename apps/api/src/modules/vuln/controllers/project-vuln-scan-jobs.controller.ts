import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryBus } from '@nestjs/cqrs';
import type { VulnScanJobDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { ListVulnScanJobsQuery } from '../queries/list-vuln-scan-jobs.query.js';

/// The project detail page's "Vulnerability Scans" tab.
@ApiTags('vuln')
@ApiBearerAuth()
@Controller('projects/:projectId/vuln/jobs')
export class ProjectVulnScanJobsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiOperation({ summary: "List a project's vulnerability scan jobs" })
  list(
    @Param('projectId') projectId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<VulnScanJobDto[]> {
    return this.queryBus.execute(
      new ListVulnScanJobsQuery(user.id, { projectId }),
    );
  }
}
