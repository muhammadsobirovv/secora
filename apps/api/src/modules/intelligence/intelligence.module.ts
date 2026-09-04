import { Module } from '@nestjs/common';
import { ThreatIntelModule } from '../threat-intel/threat-intel.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { TechnologyDetectionService } from './technology-detection.service.js';
import { AssetGraphService } from './asset-graph.service.js';
import { ChangeDetectionService } from './change-detection.service.js';
import { FindingCorrelationService } from './finding-correlation.service.js';
import { CveIntelligenceService } from './cve-intelligence.service.js';
import { VulnerabilityMatchingService } from './vulnerability-matching.service.js';
import { ReconJobCompletedIntelligenceHandler } from './handlers/recon-job-completed-intelligence.handler.js';
import { IntelligenceController } from './controllers/intelligence.controller.js';
import { CveIntelligenceController } from './controllers/cve-intelligence.controller.js';

/// Module 16 — tasks #372-376 (Recon intelligence normalization, Asset
/// Graph, Technology fingerprinting, Attack Surface, Change Detection).
/// No module import of ReconModule needed — the coupling is purely
/// event-driven (`ReconJobCompletedIntelligenceHandler` subscribes via the
/// global CqrsModule.forRoot() EventBus, see app.module.ts's doc comment
/// on CQRS wiring), so there's no risk of a circular module dependency
/// even though this reads Recon's own Prisma tables directly.
///
/// Module 17 (task #469) imports `ThreatIntelModule` for exactly one
/// reason: so `ReconJobCompletedIntelligenceHandler` can inject
/// `ThreatMatchService` and call it alongside `VulnerabilityMatchingService`
/// — reusing this module's existing single Recon-completion subscriber
/// rather than adding a second one (see `ThreatIntelModule`'s own doc
/// comment). Not circular: `ThreatIntelModule` does not import this module.
@Module({
  // Module 18 — task #508 (IDOR sweep). WorkspacesModule added so
  // CveIntelligenceController can resolve the caller's own workspaceId
  // for its cve-matches/:targetId route (see that controller's doc
  // comment) — same DI shape ThreatIntelModule already uses for its own
  // sibling controller.
  imports: [ThreatIntelModule, WorkspacesModule],
  controllers: [IntelligenceController, CveIntelligenceController],
  providers: [
    TechnologyDetectionService,
    AssetGraphService,
    ChangeDetectionService,
    FindingCorrelationService,
    CveIntelligenceService,
    VulnerabilityMatchingService,
    ReconJobCompletedIntelligenceHandler,
  ],
  exports: [
    TechnologyDetectionService,
    AssetGraphService,
    ChangeDetectionService,
    FindingCorrelationService,
    CveIntelligenceService,
    VulnerabilityMatchingService,
  ],
})
export class IntelligenceModule {}
