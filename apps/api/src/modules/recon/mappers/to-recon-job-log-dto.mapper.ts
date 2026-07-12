import type { ReconJobLogDto } from '@pentesthub/shared';
import type { ReconJobLog } from '../../../prisma-types.js';

export function toReconJobLogDto(log: ReconJobLog): ReconJobLogDto {
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
