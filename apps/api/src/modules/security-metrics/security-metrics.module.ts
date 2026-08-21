import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { SecurityMetricsService } from './security-metrics.service.js';
import { SecurityMetricsController } from './controllers/security-metrics.controller.js';

/// Module 17 — task #479 (Security Metrics). No dependency on
/// Incidents/Remediation/SLA modules — reads their tables directly via
/// `PrismaService` (read-only aggregation, same posture as the existing
/// `enterprise-analytics.query.ts` handler), so no risk of circularity.
@Module({
  imports: [WorkspacesModule],
  controllers: [SecurityMetricsController],
  providers: [SecurityMetricsService],
  exports: [SecurityMetricsService],
})
export class SecurityMetricsModule {}
