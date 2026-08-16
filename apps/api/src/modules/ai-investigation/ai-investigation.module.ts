import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { TargetsModule } from '../targets/targets.module.js';
import { SecurityModule } from '../security/security.module.js';
import { AiCoreModule } from '../ai/ai-core.module.js';
import { IntelligenceModule } from '../intelligence/intelligence.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AiInvestigationService } from './ai-investigation.service.js';
import { AiInvestigationController } from './controllers/ai-investigation.controller.js';

/// Module 16 — AI Investigation Mode (task #398). Deliberately imports
/// `SecurityModule` (Scope Engine + Approval Gate) and reuses its
/// services rather than re-implementing any part of them — see
/// `AiInvestigationService`'s class doc comment for the full security
/// rationale. `CommandBus` (used to dispatch `CreateReconJobCommand`/
/// `CreateVulnScanJobCommand`) needs no module import here: `CqrsModule`
/// is registered globally in `app.module.ts` (see
/// `StartReconScanTool`/`StartVulnerabilityScanTool` in Module 11, which
/// establish the same pattern of dispatching those commands from outside
/// the Recon/Vuln modules without importing them).
@Module({
  imports: [
    WorkspacesModule,
    ProjectsModule,
    TargetsModule,
    SecurityModule,
    AiCoreModule,
    IntelligenceModule,
    AuditModule,
  ],
  controllers: [AiInvestigationController],
  providers: [AiInvestigationService],
  exports: [AiInvestigationService],
})
export class AiInvestigationModule {}
