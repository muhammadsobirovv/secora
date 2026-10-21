import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  VULN_SCAN_JOBS_REPOSITORY,
  type VulnScanJobsRepository,
} from '../domain/repositories/vuln-scan-jobs.repository.interface.js';

const WINDOW_MS = 60 * 60 * 1000;

/// Admission control for new vulnerability scans: runs before the plan quota
/// (QuotaService) so an abusive burst is refused cheaply.
///  - one scan per target at a time (queued or running);
///  - at most N scans per target per rolling hour;
///  - at most M scans per workspace per rolling hour.
/// Concurrency across the worker is capped separately by
/// VULN_WORKER_CONCURRENCY (default 2). All refusals are HTTP 429 with a
/// stable code the UI maps to a message.
@Injectable()
export class ScanAdmissionService {
  constructor(
    @Inject(VULN_SCAN_JOBS_REPOSITORY)
    private readonly jobs: VulnScanJobsRepository,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async assertAllowed(input: {
    workspaceId: string;
    targetId: string;
    now?: Date;
  }): Promise<void> {
    if ((await this.jobs.countActiveForTarget(input.targetId)) > 0) {
      throw new AppException(
        'SCAN_TARGET_BUSY',
        'A scan of this target is already queued or running. Wait for it to finish before starting another.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const since = new Date((input.now ?? new Date()).getTime() - WINDOW_MS);
    const maxPerTarget = this.configService.get('VULN_SCAN_MAX_PER_TARGET_PER_HOUR', { infer: true });
    const maxPerWorkspace = this.configService.get('VULN_SCAN_MAX_PER_WORKSPACE_PER_HOUR', { infer: true });

    const [perTarget, perWorkspace] = await Promise.all([
      this.jobs.countCreatedSince({ since, targetId: input.targetId }),
      this.jobs.countCreatedSince({ since, workspaceId: input.workspaceId }),
    ]);

    if (perTarget >= maxPerTarget) {
      throw new AppException(
        'SCAN_RATE_LIMITED',
        `This target reached its limit of ${maxPerTarget} scans per hour. Try again later.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (perWorkspace >= maxPerWorkspace) {
      throw new AppException(
        'SCAN_RATE_LIMITED',
        `Your workspace reached its limit of ${maxPerWorkspace} scans per hour. Try again later.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
