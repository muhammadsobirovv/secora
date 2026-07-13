import type { VulnScanJobLogDto } from '@pentesthub/shared';
import type { VulnScanJobLog } from '../../../prisma-types.js';

export function toVulnScanJobLogDto(log: VulnScanJobLog): VulnScanJobLogDto {
  return {
    id: log.id,
    seq: log.seq.toString(),
    jobId: log.jobId,
    toolRunId: log.toolRunId,
    level: log.level,
    message: log.message,
    createdAt: log.createdAt.toISOString(),
  };
}
