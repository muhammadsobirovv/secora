import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/// Module 17 — REST API task #489. Passed straight through to
/// `SecurityMetricsService.summary`'s own `windowDays` — same bounds as
/// `SecurityMetricsSummaryQueryDto` (that service's own validator), kept
/// as a separate class rather than reused directly so `/soc/dashboard`'s
/// Swagger doc describes its own query contract independently of
/// `/security-metrics/summary`'s.
export class SocDashboardQueryDto {
  @ApiPropertyOptional({ description: 'Lookback window in days for the embedded MTTD/MTTR/MTTV/SLA-compliance metrics', default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(730)
  windowDays?: number;
}
