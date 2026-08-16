import { Module } from '@nestjs/common';
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
@Module({
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
