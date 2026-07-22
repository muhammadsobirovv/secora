import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CommandBus } from '@nestjs/cqrs';
import type { DistributedJobDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { Public } from '../../../common/decorators/public.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { ApiKeyAuthGuard } from '../../public-api/guards/api-key-auth.guard.js';
import { ClaimJobsDto, CompleteJobDto, FailJobDto } from '../dto/distributed-jobs.dto.js';
import { ClaimNextJobsCommand, CompleteDistributedJobCommand, FailDistributedJobCommand } from '../commands/distributed-jobs.commands.js';

/// Machine-facing claim/complete/fail — the actual "distributed" half of
/// the Distributed Job System, called by worker processes (potentially on
/// other machines entirely) rather than by the dashboard. Authenticated
/// via `X-API-Key` the same way `WorkerNodesController`'s register/
/// heartbeat routes are; deliberately flat (`/distributed-jobs/...`, no
/// `:organizationId`) since a job's tenant is already resolved from the
/// claiming/reporting worker's own `WorkerNode.organizationId`, not
/// re-supplied by the caller.
@ApiTags('distributed-jobs')
@Controller('distributed-jobs')
export class WorkerJobsController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('workers/:workerId/claim')
  @Public()
  @UseGuards(ApiKeyAuthGuard)
  @ApiSecurity('apiKey')
  @ApiOperation({ summary: 'Claim up to maxJobs QUEUED jobs matching declared capabilities (X-API-Key)' })
  claim(
    @Param('workerId') workerId: string,
    @Body() dto: ClaimJobsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<DistributedJobDto[]> {
    return this.commandBus.execute(new ClaimNextJobsCommand(user.id, workerId, dto));
  }

  @Post(':id/complete')
  @Public()
  @UseGuards(ApiKeyAuthGuard)
  @ApiSecurity('apiKey')
  @ApiOperation({ summary: 'Report a claimed job as succeeded (X-API-Key)' })
  complete(
    @Param('id') id: string,
    @Body() dto: CompleteJobDto,
    @CurrentUser() user: RequestUser,
  ): Promise<DistributedJobDto> {
    return this.commandBus.execute(new CompleteDistributedJobCommand(user.id, id, dto));
  }

  @Post(':id/fail')
  @Public()
  @UseGuards(ApiKeyAuthGuard)
  @ApiSecurity('apiKey')
  @ApiOperation({ summary: 'Report a claimed job as failed — retried if under maxAttempts, else terminally FAILED (X-API-Key)' })
  fail(
    @Param('id') id: string,
    @Body() dto: FailJobDto,
    @CurrentUser() user: RequestUser,
  ): Promise<DistributedJobDto> {
    return this.commandBus.execute(new FailDistributedJobCommand(user.id, id, dto));
  }
}
