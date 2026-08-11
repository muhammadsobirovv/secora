import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ClusterOverviewDto } from '@pentesthub/shared';
import { ClusterOverviewService } from '../cluster-overview.service.js';

/// Module 14 — Admin Console. Route matches
/// `ADMIN_INFRASTRUCTURE_ENDPOINTS.clusterOverview()` in
/// `@pentesthub/shared` (`/infrastructure/admin/cluster-overview`) — see
/// `ClusterOverviewService`'s doc comment for the authorization posture
/// (authenticated, not additionally role-gated — no deployment-wide
/// admin role exists in this codebase yet).
@ApiTags('infrastructure')
@Controller('infrastructure/admin')
export class ClusterOverviewController {
  constructor(private readonly clusterOverviewService: ClusterOverviewService) {}

  @Get('cluster-overview')
  @ApiOperation({
    summary:
      'Admin Console infrastructure dashboard — cluster leases, workers, queue, cache, storage, database, backups, plugins, and licensing in one call',
  })
  getOverview(): Promise<ClusterOverviewDto> {
    return this.clusterOverviewService.getOverview();
  }
}
