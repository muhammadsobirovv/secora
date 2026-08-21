import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { IncidentsModule } from '../incidents/incidents.module.js';
import { AiSocAnalystModule } from '../ai-soc-analyst/ai-soc-analyst.module.js';
import { ThreatIntelModule } from '../threat-intel/threat-intel.module.js';
import { SecurityModule } from '../security/security.module.js';
import { AiCoreModule } from '../ai/ai-core.module.js';
import { IncidentInvestigationService } from './incident-investigation.service.js';
import { IncidentInvestigationController } from './controllers/incident-investigation.controller.js';

/// Module 17 — task #472 (AI Investigation Workflow, defensive lifecycle).
/// Imports `IncidentsModule` (ownership checks + link/timeline reads),
/// `AiSocAnalystModule` (the AI_ANALYSIS step delegates entirely to
/// `AiSocAnalystService` — never a second AI-analysis implementation),
/// `ThreatIntelModule` (`IndicatorsService`, for the THREAT_INTEL_LOOKUP
/// step), `SecurityModule` (`SecurityApprovalService` — the same Approval
/// Gate every other high-risk-adjacent operation type uses), and
/// `AiCoreModule` (`AiProviderRegistryService`, for plan generation). All
/// one-directional: none of these import this module back.
@Module({
  imports: [WorkspacesModule, IncidentsModule, AiSocAnalystModule, ThreatIntelModule, SecurityModule, AiCoreModule],
  controllers: [IncidentInvestigationController],
  providers: [IncidentInvestigationService],
  exports: [IncidentInvestigationService],
})
export class IncidentInvestigationModule {}
