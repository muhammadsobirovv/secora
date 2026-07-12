import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryBus } from '@nestjs/cqrs';
import type { ReconJobDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { ListReconJobsQuery } from '../queries/list-recon-jobs.query.js';

/// The project detail page's "Scan History" tab.
@ApiTags('recon')
@ApiBearerAuth()
@Controller('projects/:projectId/recon/jobs')
export class ProjectReconJobsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiOperation({ summary: "List a project's recon jobs" })
  list(
    @Param('projectId') projectId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ReconJobDto[]> {
    return this.queryBus.execute(
      new ListReconJobsQuery(user.id, { projectId }),
    );
  }
}
