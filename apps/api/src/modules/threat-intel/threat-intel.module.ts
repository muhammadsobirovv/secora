import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { IndicatorsService } from './indicators.service.js';
import { ThreatIntelCatalogService } from './threat-intel-catalog.service.js';
import { ThreatIntelProviderService } from './threat-intel-provider.service.js';
import { StixTaxiiService } from './stix-taxii.service.js';
import { ThreatMatchService } from './threat-match.service.js';
import { ThreatIntelController } from './controllers/threat-intel.controller.js';

/// Module 17 — Threat Intelligence Engine (tasks #465-469). Exports
/// `ThreatMatchService` specifically so `IntelligenceModule` can inject it
/// into the existing `ReconJobCompletedIntelligenceHandler` — the one
/// canonical Recon-completion event subscriber every derived-intelligence
/// service (Technology detection, Asset Graph, Change Detection, Finding
/// Correlation, Vulnerability Matching) already hooks into, rather than
/// registering a second `@EventsHandler(ReconJobCompletedEvent)`
/// subscriber here (would violate "use the existing EventBus" — a second
/// handler for the same event is a second, competing integration point,
/// not reuse of the first).
@Module({
  imports: [WorkspacesModule],
  controllers: [ThreatIntelController],
  providers: [
    IndicatorsService,
    ThreatIntelCatalogService,
    ThreatIntelProviderService,
    StixTaxiiService,
    ThreatMatchService,
  ],
  exports: [
    IndicatorsService,
    ThreatIntelCatalogService,
    ThreatIntelProviderService,
    StixTaxiiService,
    ThreatMatchService,
  ],
})
export class ThreatIntelModule {}
