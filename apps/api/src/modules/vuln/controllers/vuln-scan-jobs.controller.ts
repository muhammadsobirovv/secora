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
  VulnFindingDto,
  VulnScanJobDto,
  VulnScanJobLogDto,
} from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { StopVulnScanJobCommand } from '../commands/stop-vuln-scan-job.command.js';
import { PauseVulnScanJobCommand } from '../commands/pause-vuln-scan-job.command.js';
import { ResumeVulnScanJobCommand } from '../commands/resume-vuln-scan-job.command.js';
import { RetryVulnScanJobCommand } from '../commands/retry-vuln-scan-job.command.js';
import { GetVulnScanJobQuery } from '../queries/get-vuln-scan-job.query.js';
import { ListVulnScanJobsQuery } from '../queries/list-vuln-scan-jobs.query.js';
import { ListVulnFindingsQuery } from '../queries/list-vuln-findings.query.js';
import { ListVulnScanJobLogsQuery } from '../queries/list-vuln-scan-job-logs.query.js';

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

/// Flat /vuln/jobs/:jobId routes — job ids are globally unique UUIDs, same
/// convention as Module 3's ReconJobsController. `recent` must be
/// declared before `:jobId` so it isn't swallowed by the parameterized
/// route.
@ApiTags('vuln')
@ApiBearerAuth()
@Controller('vuln/jobs')
export class VulnScanJobsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  @Get('recent')
  @ApiOperation({
    summary: 'Recent vulnerability scan jobs across the workspace',
  })
  listRecent(@CurrentUser() user: RequestUser): Promise<VulnScanJobDto[]> {
    return this.queryBus.execute(
      new ListVulnScanJobsQuery(user.id, { limit: 10 }),
    );
  }

  @Get(':jobId')
  @ApiOperation({ summary: 'Get a vulnerability scan job' })
  get(
    @Param('jobId') jobId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<VulnScanJobDto> {
    return this.queryBus.execute(new GetVulnScanJobQuery(user.id, jobId));
  }

  @Post(':jobId/stop')
  @ApiOperation({ summary: 'Stop a vulnerability scan job' })
  stop(
    @Param('jobId') jobId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<VulnScanJobDto> {
    return this.commandBus.execute(new StopVulnScanJobCommand(user.id, jobId));
  }

  @Post(':jobId/pause')
  @ApiOperation({ summary: 'Pause a running vulnerability scan job' })
  pause(
    @Param('jobId') jobId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<VulnScanJobDto> {
    return this.commandBus.execute(new PauseVulnScanJobCommand(user.id, jobId));
  }

  @Post(':jobId/resume')
  @ApiOperation({ summary: 'Resume a paused vulnerability scan job' })
  resume(
    @Param('jobId') jobId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<VulnScanJobDto> {
    return this.commandBus.execute(
      new ResumeVulnScanJobCommand(user.id, jobId),
    );
  }

  @Post(':jobId/retry')
  @ApiOperation({ summary: 'Retry a failed vulnerability scan job' })
  retry(
    @Param('jobId') jobId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<VulnScanJobDto> {
    return this.commandBus.execute(new RetryVulnScanJobCommand(user.id, jobId));
  }

  @Get(':jobId/findings')
  @ApiOperation({ summary: "List a job's findings" })
  findings(
    @Param('jobId') jobId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<VulnFindingDto[]> {
    return this.queryBus.execute(new ListVulnFindingsQuery(user.id, { jobId }));
  }

  // Module 18 — task #517 (SSE hardening audit), disclosed known
  // limitation, same as the identical shape in
  // ReconJobsController.streamLogs — see that method's comment. Not
  // duplicated in full here to avoid drift; the same "no data written
  // during a quiet poll stretch → idle-proxy risk, and Nest's @Sse() has
  // no raw-comment-frame hook to fix it safely" reasoning applies
  // verbatim.
  @Sse(':jobId/logs/stream')
  @ApiOperation({ summary: 'Live log stream for a running job (SSE)' })
  async streamLogs(
    @Param('jobId') jobId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<Observable<MessageEvent>> {
    // Synchronous (relative to stream setup) ownership check — a
    // forbidden/missing job throws a normal HTTP error here, instead of
    // opening a stream that immediately errors.
    await this.queryBus.execute(new GetVulnScanJobQuery(user.id, jobId));

    const pollIntervalMs = this.configService.get(
      'VULN_JOB_LOG_SSE_POLL_INTERVAL_MS',
      { infer: true },
    );

    return new Observable<MessageEvent>((subscriber) => {
      let sinceSeq: string | null = null;
      let stopped = false;

      const poll = async (): Promise<void> => {
        if (stopped) return;
        try {
          const logs = await this.queryBus.execute<
            ListVulnScanJobLogsQuery,
            VulnScanJobLogDto[]
          >(new ListVulnScanJobLogsQuery(user.id, jobId, sinceSeq));
          for (const log of logs) {
            subscriber.next({ data: log });
            sinceSeq = log.seq;
          }
          const job = await this.queryBus.execute<
            GetVulnScanJobQuery,
            VulnScanJobDto
          >(new GetVulnScanJobQuery(user.id, jobId));
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
