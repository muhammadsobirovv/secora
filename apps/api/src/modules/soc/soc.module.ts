import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { IncidentsModule } from '../incidents/incidents.module.js';
import { SlaModule } from '../sla/sla.module.js';
import { ThreatIntelModule } from '../threat-intel/threat-intel.module.js';
import { SecurityMetricsModule } from '../security-metrics/security-metrics.module.js';
import { SocService } from './soc.service.js';
import { SocController } from './controllers/soc.controller.js';

/// Module 17 — REST API task #489 (`/soc` dashboard aggregation).
/// One-directional imports only: `IncidentsModule`/`SlaModule`/
/// `ThreatIntelModule`/`SecurityMetricsModule` each already exist and
/// export the one service this module needs from each — none of them
/// import `SocModule` back, so there is no circular dependency to guard
/// against (same reasoning `RiskModule`'s own doc comment gives for its
/// one-directional `BugBountyModule` import).
@Module({
  imports: [WorkspacesModule, IncidentsModule, SlaModule, ThreatIntelModule, SecurityMetricsModule],
  controllers: [SocController],
  providers: [SocService],
  exports: [SocService],
})
export class SocModule {}
