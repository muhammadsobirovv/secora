import { Module } from '@nestjs/common';
import { VulnCoreModule } from './vuln-core.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { TargetsModule } from '../targets/targets.module.js';
import { SecurityModule } from '../security/security.module.js';
import { BillingCoreModule } from '../billing/billing-core.module.js';
import { CreateVulnScanJobHandler } from './commands/create-vuln-scan-job.command.js';
import { StopVulnScanJobHandler } from './commands/stop-vuln-scan-job.command.js';
import { PauseVulnScanJobHandler } from './commands/pause-vuln-scan-job.command.js';
import { ResumeVulnScanJobHandler } from './commands/resume-vuln-scan-job.command.js';
import { RetryVulnScanJobHandler } from './commands/retry-vuln-scan-job.command.js';
import { UpdateVulnFindingStatusHandler } from './commands/update-vuln-finding-status.command.js';
import { BulkUpdateVulnFindingsHandler } from './commands/bulk-update-vuln-findings.command.js';
import { CreateVulnScanTemplateHandler } from './commands/create-vuln-scan-template.command.js';
import { DeleteVulnScanTemplateHandler } from './commands/delete-vuln-scan-template.command.js';
import { GetVulnScanJobHandler } from './queries/get-vuln-scan-job.query.js';
import { ListVulnScanJobsHandler } from './queries/list-vuln-scan-jobs.query.js';
import { GetVulnFindingHandler } from './queries/get-vuln-finding.query.js';
import { ListVulnFindingsHandler } from './queries/list-vuln-findings.query.js';
import { ListVulnScanJobLogsHandler } from './queries/list-vuln-scan-job-logs.query.js';
import { ListVulnScanTemplatesHandler } from './queries/list-vuln-scan-templates.query.js';
import { GetVulnScanTemplateHandler } from './queries/get-vuln-scan-template.query.js';
import { GetVulnDashboardSummaryHandler } from './queries/get-vuln-dashboard-summary.query.js';
import { ListVulnScannerHistoryHandler } from './queries/list-vuln-scanner-history.query.js';
import { TargetVulnScanJobsController } from './controllers/target-vuln-scan-jobs.controller.js';
import { ProjectVulnScanJobsController } from './controllers/project-vuln-scan-jobs.controller.js';
import { VulnScanJobsController } from './controllers/vuln-scan-jobs.controller.js';
import { TargetVulnFindingsController } from './controllers/target-vuln-findings.controller.js';
import { VulnFindingsController } from './controllers/vuln-findings.controller.js';
import { VulnScanTemplatesController } from './controllers/vuln-scan-templates.controller.js';
import { VulnDashboardController } from './controllers/vuln-dashboard.controller.js';

/// The HTTP-facing half: VulnCoreModule's repositories/services plus
/// controllers and CQRS handlers. Controllers only ever insert a
/// VulnScanJob row and return — see VulnScanJobPollerService (imported
/// transitively via VulnCoreModule) for where jobs actually execute,
/// which this module never invokes directly. Mirrors ReconModule
/// (Module 3) exactly.
///
/// Module 20 — Phase 8. `BillingCoreModule` added so
/// `CreateVulnScanJobHandler` can enforce the `SCANNER_JOBS` quota at
/// job-creation time — mirrors the identical `ReconModule` change exactly.
@Module({
  imports: [VulnCoreModule, WorkspacesModule, ProjectsModule, TargetsModule, SecurityModule, BillingCoreModule],
  controllers: [
    TargetVulnScanJobsController,
    ProjectVulnScanJobsController,
    VulnScanJobsController,
    TargetVulnFindingsController,
    VulnFindingsController,
    VulnScanTemplatesController,
    VulnDashboardController,
  ],
  providers: [
    CreateVulnScanJobHandler,
    StopVulnScanJobHandler,
    PauseVulnScanJobHandler,
    ResumeVulnScanJobHandler,
    RetryVulnScanJobHandler,
    UpdateVulnFindingStatusHandler,
    BulkUpdateVulnFindingsHandler,
    CreateVulnScanTemplateHandler,
    DeleteVulnScanTemplateHandler,
    GetVulnScanJobHandler,
    ListVulnScanJobsHandler,
    GetVulnFindingHandler,
    ListVulnFindingsHandler,
    ListVulnScanJobLogsHandler,
    ListVulnScanTemplatesHandler,
    GetVulnScanTemplateHandler,
    GetVulnDashboardSummaryHandler,
    ListVulnScannerHistoryHandler,
  ],
})
export class VulnModule {}
