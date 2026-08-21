import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { AiCoreModule } from '../ai/ai-core.module.js';
import { RemediationService } from './remediation.service.js';
import { FindingVerificationService } from './finding-verification.service.js';
import { RemediationController, FindingVerificationController } from './controllers/remediation.controller.js';

/// Module 17 — task #477 (Remediation tracking & verification). Also
/// imports `AiCoreModule` (task #485 — AI Memory extension) so
/// `RemediationService` can inject `AiMemoryService` — same
/// import-the-owning-module pattern as `IncidentsModule`.
@Module({
  imports: [WorkspacesModule, AiCoreModule],
  controllers: [RemediationController, FindingVerificationController],
  providers: [RemediationService, FindingVerificationService],
  exports: [RemediationService, FindingVerificationService],
})
export class RemediationModule {}
