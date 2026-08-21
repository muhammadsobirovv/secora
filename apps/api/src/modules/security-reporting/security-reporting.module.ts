import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { IncidentsModule } from '../incidents/incidents.module.js';
import { SlaModule } from '../sla/sla.module.js';
import { RemediationModule } from '../remediation/remediation.module.js';
import { ThreatIntelModule } from '../threat-intel/threat-intel.module.js';
import { SecurityMetricsModule } from '../security-metrics/security-metrics.module.js';
import { SecurityReportingService } from './security-reporting.service.js';
import { SecurityReportingController } from './controllers/security-reporting.controller.js';

@Module({
  imports: [WorkspacesModule, IncidentsModule, SlaModule, RemediationModule, ThreatIntelModule, SecurityMetricsModule],
  controllers: [SecurityReportingController],
  providers: [SecurityReportingService],
  exports: [SecurityReportingService],
})
export class SecurityReportingModule {}
