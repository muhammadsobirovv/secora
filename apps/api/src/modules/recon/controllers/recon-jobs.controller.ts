import {
  Controller,
  Get,
  MessageEvent,
  Param,
  Post,
  Sse,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import type {
  ReconFindingDto,
  ReconJobDto,
  ReconJobLogDto,
} from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { CancelReconJobCommand } from '../commands/cancel-recon-job.command.js';
import { RetryReconJobCommand } from '../commands/retry-recon-job.command.js';
import { GetReconJobQuery } from '../queries/get-recon-job.query.js';
import { ListReconJobsQuery } from '../queries/list-recon-jobs.query.js';
import { ListReconFindingsQuery } from '../queries/list-recon-findings.query.js';
import { ListReconJobLogsQuery } from '../queries/list-recon-job-logs.query.js';

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

/// Flat /recon/jobs/:jobId routes — job ids are globally unique UUIDs,
/// same convention as TargetsController. `recent` must be declared before
/// `:jobId` so it isn't swallowed by the parameterized route.
@ApiTags('recon')
@ApiBearerAuth()
@Controller('recon/jobs')
export class ReconJobsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  @Get('recent')
  @ApiOperation({ summary: 'Recent recon jobs across the workspace' })
  listRecent(@CurrentUser() user: RequestUser): Promise<ReconJobDto[]> {
    return this.queryBus.execute(
      new ListReconJobsQuery(user.id, { limit: 10 }),
    );
  }

  @Get(':jobId')
  @ApiOperation({ summary: 'Get a recon job' })
  get(
    @Param('jobId') jobId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ReconJobDto> {
    return this.queryBus.execute(new GetReconJobQuery(user.id, jobId));
  }

  @Post(':jobId/cancel')
  @ApiOperation({ summary: 'Cancel a recon job' })
  cancel(
    @Param('jobId') jobId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ReconJobDto> {
    return this.commandBus.execute(new CancelReconJobCommand(user.id, jobId));
  }

  @Post(':jobId/retry')
  @ApiOperation({ summary: 'Retry a failed recon job' })
  retry(
    @Param('jobId') jobId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ReconJobDto> {
    return this.commandBus.execute(new RetryReconJobCommand(user.id, jobId));
  }

  @Get(':jobId/findings')
  @ApiOperation({ summary: "List a job's findings" })
  findings(
    @Param('jobId') jobId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ReconFindingDto[]> {
    return this.queryBus.execute(
      new ListReconFindingsQuery(user.id, { jobId }),
    );
  }

  @Sse(':jobId/logs/stream')
  @ApiOperation({ summary: 'Live log stream for a running job (SSE)' })
  async streamLogs(
    @Param('jobId') jobId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<Observable<MessageEvent>> {
    // Synchronous (relative to stream setup) ownership check — a
    // forbidden/missing job throws a normal HTTP error here, instead of
    // opening a stream that immediately errors.
    await this.queryBus.execute(new GetReconJobQuery(user.id, jobId));

    const pollIntervalMs = this.configService.get(
      'RECON_JOB_LOG_SSE_POLL_INTERVAL_MS',
      { infer: true },
    );

    return new Observable<MessageEvent>((subscriber) => {
      let sinceSeq: string | null = null;
      let stopped = false;

      const poll = async (): Promise<void> => {
        if (stopped) return;
        try {
          const logs = await this.queryBus.execute<
            ListReconJobLogsQuery,
            ReconJobLogDto[]
          >(new ListReconJobLogsQuery(user.id, jobId, sinceSeq));
          for (const log of logs) {
            subscriber.next({ data: log });
            sinceSeq = log.seq;
          }
          const job = await this.queryBus.execute<
            GetReconJobQuery,
            ReconJobDto
          >(new GetReconJobQuery(user.id, jobId));
          if (TERMINAL_STATUSES.has(job.status)) {
            subscriber.complete();
            return;
          }
        } catch (error) {
          subscriber.error(error);
          return;
        }
        setTimeout(() => void poll(), pollIntervalMs);
      };
      void poll();

      return () => {
        stopped = true;
      };
    });
  }
}
