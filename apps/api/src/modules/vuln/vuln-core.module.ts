import { Module } from '@nestjs/common';
import { TargetsModule } from '../targets/targets.module.js';
import { EvidenceModule } from '../evidence/evidence.module.js';
import { VULN_SCAN_JOBS_REPOSITORY } from './domain/repositories/vuln-scan-jobs.repository.interface.js';
import { PrismaVulnScanJobsRepository } from './infrastructure/persistence/prisma/prisma-vuln-scan-jobs.repository.js';
import { VULN_SCAN_JOB_TOOL_RUNS_REPOSITORY } from './domain/repositories/vuln-scan-job-tool-runs.repository.interface.js';
import { PrismaVulnScanJobToolRunsRepository } from './infrastructure/persistence/prisma/prisma-vuln-scan-job-tool-runs.repository.js';
import { VULN_SCAN_JOB_LOGS_REPOSITORY } from './domain/repositories/vuln-scan-job-logs.repository.interface.js';
import { PrismaVulnScanJobLogsRepository } from './infrastructure/persistence/prisma/prisma-vuln-scan-job-logs.repository.js';
import { VULN_FINDINGS_REPOSITORY } from './domain/repositories/vuln-findings.repository.interface.js';
import { PrismaVulnFindingsRepository } from './infrastructure/persistence/prisma/prisma-vuln-findings.repository.js';
import { VULN_SCAN_TEMPLATES_REPOSITORY } from './domain/repositories/vuln-scan-templates.repository.interface.js';
import { PrismaVulnScanTemplatesRepository } from './infrastructure/persistence/prisma/prisma-vuln-scan-templates.repository.js';
import { NucleiScannerRunner } from './scanner-runners/adapters/nuclei.scanner-runner.js';
import { FfufScannerRunner } from './scanner-runners/adapters/ffuf.scanner-runner.js';
import { DirsearchScannerRunner } from './scanner-runners/adapters/dirsearch.scanner-runner.js';
import { FeroxbusterScannerRunner } from './scanner-runners/adapters/feroxbuster.scanner-runner.js';
import { NiktoScannerRunner } from './scanner-runners/adapters/nikto.scanner-runner.js';
import { NucleiNormalizer } from './scanner-runners/normalizers/nuclei.normalizer.js';
import { FfufNormalizer } from './scanner-runners/normalizers/ffuf.normalizer.js';
import { DirsearchNormalizer } from './scanner-runners/normalizers/dirsearch.normalizer.js';
import { FeroxbusterNormalizer } from './scanner-runners/normalizers/feroxbuster.normalizer.js';
import { NiktoNormalizer } from './scanner-runners/normalizers/nikto.normalizer.js';
import { ScannerRunnerRegistry } from './scanner-runners/scanner-runner-registry.service.js';
import { ScannerProcessSpawner } from './scanner-runners/process/spawn-scanner-process.util.js';
import { VulnScanJobExecutionService } from './execution/vuln-scan-job-execution.service.js';
import { VulnScanJobPollerService } from './execution/vuln-scan-job-poller.service.js';

/// Everything the Vuln HTTP module AND the separate worker process both
/// need — repositories, scanner-runners, normalizers, the execution/
/// poller services. Deliberately has no controllers, same "controllers
/// only enqueue jobs, workers execute them" enforcement Module 3's
/// ReconCoreModule uses (see docs/adr/0004-vulnerability-engine-module.md).
/// No AttachmentsModule/StorageService dependency, unlike ReconCoreModule
/// — every v1 scanner's evidence is plain text (Evidence.textContent),
/// never a file, so there's nothing here that needs blob storage.
@Module({
  imports: [TargetsModule, EvidenceModule],
  providers: [
    {
      provide: VULN_SCAN_JOBS_REPOSITORY,
      useClass: PrismaVulnScanJobsRepository,
    },
    {
      provide: VULN_SCAN_JOB_TOOL_RUNS_REPOSITORY,
      useClass: PrismaVulnScanJobToolRunsRepository,
    },
    {
      provide: VULN_SCAN_JOB_LOGS_REPOSITORY,
      useClass: PrismaVulnScanJobLogsRepository,
    },
    {
      provide: VULN_FINDINGS_REPOSITORY,
      useClass: PrismaVulnFindingsRepository,
    },
    {
      provide: VULN_SCAN_TEMPLATES_REPOSITORY,
      useClass: PrismaVulnScanTemplatesRepository,
    },
    ScannerProcessSpawner,
    NucleiScannerRunner,
    FfufScannerRunner,
    DirsearchScannerRunner,
    FeroxbusterScannerRunner,
    NiktoScannerRunner,
    NucleiNormalizer,
    FfufNormalizer,
    DirsearchNormalizer,
    FeroxbusterNormalizer,
    NiktoNormalizer,
    ScannerRunnerRegistry,
    VulnScanJobExecutionService,
    VulnScanJobPollerService,
  ],
  exports: [
    VULN_SCAN_JOBS_REPOSITORY,
    VULN_SCAN_JOB_TOOL_RUNS_REPOSITORY,
    VULN_SCAN_JOB_LOGS_REPOSITORY,
    VULN_FINDINGS_REPOSITORY,
    VULN_SCAN_TEMPLATES_REPOSITORY,
    VulnScanJobExecutionService,
    VulnScanJobPollerService,
    // Module 16 — Terminal workspace (task #388). Same reasoning as
    // ReconCoreModule's export of ToolRunnerRegistry.
    ScannerRunnerRegistry,
  ],
})
export class VulnCoreModule {}
