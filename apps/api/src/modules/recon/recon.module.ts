import { Module } from '@nestjs/common';
import { ReconCoreModule } from './recon-core.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { TargetsModule } from '../targets/targets.module.js';
import { SecurityModule } from '../security/security.module.js';
import { BillingCoreModule } from '../billing/billing-core.module.js';
import { CreateReconJobHandler } from './commands/create-recon-job.command.js';
import { CancelReconJobHandler } from './commands/cancel-recon-job.command.js';
import { RetryReconJobHandler } from './commands/retry-recon-job.command.js';
import { PromoteFindingToTargetHandler } from './commands/promote-finding-to-target.command.js';
import { GetReconJobHandler } from './queries/get-recon-job.query.js';
import { ListReconJobsHandler } from './queries/list-recon-jobs.query.js';
import { ListReconFindingsHandler } from './queries/list-recon-findings.query.js';
import { GetReconFindingHandler } from './queries/get-recon-finding.query.js';
import { ListReconJobLogsHandler } from './queries/list-recon-job-logs.query.js';
import { TargetReconJobsController } from './controllers/target-recon-jobs.controller.js';
import { ProjectReconJobsController } from './controllers/project-recon-jobs.controller.js';
import { ReconJobsController } from './controllers/recon-jobs.controller.js';
import { TargetReconFindingsController } from './controllers/target-recon-findings.controller.js';
import { ReconFindingsController } from './controllers/recon-findings.controller.js';

/// The HTTP-facing half: ReconCoreModule's repositories/services plus
/// controllers and CQRS handlers. Controllers only ever insert a ReconJob
/// row and return — see ReconJobPollerService (imported transitively via
/// ReconCoreModule) for where jobs actually execute, which this module
/// never invokes directly.
///
/// Module 20 — Phase 8. `BillingCoreModule` added so
/// `CreateReconJobHandler` can enforce the `RECON_JOBS` quota at
/// job-creation time (see its own doc comment — this was previously
/// declared in `Plan.limits`/`plan-defaults.ts` but never actually
/// enforced anywhere in this module).
@Module({
  imports: [ReconCoreModule, WorkspacesModule, ProjectsModule, TargetsModule, SecurityModule, BillingCoreModule],
  controllers: [
    TargetReconJobsController,
    ProjectReconJobsController,
    ReconJobsController,
    TargetReconFindingsController,
    ReconFindingsController,
  ],
  providers: [
    CreateReconJobHandler,
    CancelReconJobHandler,
    RetryReconJobHandler,
    PromoteFindingToTargetHandler,
    GetReconJobHandler,
    ListReconJobsHandler,
    ListReconFindingsHandler,
    GetReconFindingHandler,
    ListReconJobLogsHandler,
  ],
})
export class ReconModule {}
