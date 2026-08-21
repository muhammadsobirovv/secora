import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { IncidentsModule } from '../incidents/incidents.module.js';
import { RiskModule } from '../risk/risk.module.js';
import { AiCoreModule } from '../ai/ai-core.module.js';
import { AiSocAnalystService } from './ai-soc-analyst.service.js';
import { AiSocAnalystController } from './controllers/ai-soc-analyst.controller.js';

/// Module 17 — task #471 (AI SOC Analyst service). Imports
/// `IncidentsModule` (for `IncidentsService` — read incident/findings,
/// append the one advisory timeline event) and `RiskModule` (for
/// `RiskEngineV2Service.latestForFinding` — read-only) alongside
/// `AiCoreModule` (`AiProviderRegistryService`). All one-directional:
/// none of these import this module back, so there is no circularity
/// (mirrors `AutomationRulesModule`'s reasoning for the same imports).
@Module({
  imports: [WorkspacesModule, IncidentsModule, RiskModule, AiCoreModule],
  controllers: [AiSocAnalystController],
  providers: [AiSocAnalystService],
  exports: [AiSocAnalystService],
})
export class AiSocAnalystModule {}
