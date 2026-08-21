import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { RemediationService } from './remediation.service.js';
import { FindingVerificationService } from './finding-verification.service.js';
import { RemediationController, FindingVerificationController } from './controllers/remediation.controller.js';

/// Module 17 — task #477 (Remediation tracking & verification).
@Module({
  imports: [WorkspacesModule],
  controllers: [RemediationController, FindingVerificationController],
  providers: [RemediationService, FindingVerificationService],
  exports: [RemediationService, FindingVerificationService],
})
export class RemediationModule {}
