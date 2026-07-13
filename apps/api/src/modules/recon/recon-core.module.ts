import { Module } from '@nestjs/common';
import { TargetsModule } from '../targets/targets.module.js';
import { EvidenceModule } from '../evidence/evidence.module.js';
import { AttachmentsModule } from '../attachments/attachments.module.js';
import { RECON_JOBS_REPOSITORY } from './domain/repositories/recon-jobs.repository.interface.js';
import { PrismaReconJobsRepository } from './infrastructure/persistence/prisma/prisma-recon-jobs.repository.js';
import { RECON_JOB_TOOL_RUNS_REPOSITORY } from './domain/repositories/recon-job-tool-runs.repository.interface.js';
import { PrismaReconJobToolRunsRepository } from './infrastructure/persistence/prisma/prisma-recon-job-tool-runs.repository.js';
import { RECON_JOB_LOGS_REPOSITORY } from './domain/repositories/recon-job-logs.repository.interface.js';
import { PrismaReconJobLogsRepository } from './infrastructure/persistence/prisma/prisma-recon-job-logs.repository.js';
import { RECON_FINDINGS_REPOSITORY } from './domain/repositories/recon-findings.repository.interface.js';
import { PrismaReconFindingsRepository } from './infrastructure/persistence/prisma/prisma-recon-findings.repository.js';
import { NmapToolRunner } from './tool-runners/adapters/nmap.tool-runner.js';
import { SubfinderToolRunner } from './tool-runners/adapters/subfinder.tool-runner.js';
import { HttpxToolRunner } from './tool-runners/adapters/httpx.tool-runner.js';
import { DnsxToolRunner } from './tool-runners/adapters/dnsx.tool-runner.js';
import { NaabuToolRunner } from './tool-runners/adapters/naabu.tool-runner.js';
import { WhatWebToolRunner } from './tool-runners/adapters/whatweb.tool-runner.js';
import { AssetfinderToolRunner } from './tool-runners/adapters/assetfinder.tool-runner.js';
import { GowitnessToolRunner } from './tool-runners/adapters/gowitness.tool-runner.js';
import { AmassToolRunner } from './tool-runners/adapters/amass.tool-runner.js';
import { KatanaToolRunner } from './tool-runners/adapters/katana.tool-runner.js';
import { GauToolRunner } from './tool-runners/adapters/gau.tool-runner.js';
import { WaybackurlsToolRunner } from './tool-runners/adapters/waybackurls.tool-runner.js';
import { WhoisToolRunner } from './tool-runners/adapters/whois.tool-runner.js';
import { AsnToolRunner } from './tool-runners/adapters/asn.tool-runner.js';
import { NmapNormalizer } from './tool-runners/normalizers/nmap.normalizer.js';
import { SubfinderNormalizer } from './tool-runners/normalizers/subfinder.normalizer.js';
import { HttpxNormalizer } from './tool-runners/normalizers/httpx.normalizer.js';
import { DnsxNormalizer } from './tool-runners/normalizers/dnsx.normalizer.js';
import { NaabuNormalizer } from './tool-runners/normalizers/naabu.normalizer.js';
import { WhatWebNormalizer } from './tool-runners/normalizers/whatweb.normalizer.js';
import { AssetfinderNormalizer } from './tool-runners/normalizers/assetfinder.normalizer.js';
import { GowitnessNormalizer } from './tool-runners/normalizers/gowitness.normalizer.js';
import { AmassNormalizer } from './tool-runners/normalizers/amass.normalizer.js';
import { KatanaNormalizer } from './tool-runners/normalizers/katana.normalizer.js';
import { GauNormalizer } from './tool-runners/normalizers/gau.normalizer.js';
import { WaybackurlsNormalizer } from './tool-runners/normalizers/waybackurls.normalizer.js';
import { WhoisNormalizer } from './tool-runners/normalizers/whois.normalizer.js';
import { AsnNormalizer } from './tool-runners/normalizers/asn.normalizer.js';
import { ToolRunnerRegistry } from './tool-runners/tool-runner-registry.service.js';
import { ToolProcessSpawner } from './tool-runners/process/spawn-tool-process.util.js';
import { ReconJobExecutionService } from './execution/recon-job-execution.service.js';
import { ReconJobPollerService } from './execution/recon-job-poller.service.js';

/// Everything the Recon HTTP module AND the separate worker process both
/// need — repositories, tool-runners, normalizers, the execution/poller
/// services. Deliberately has no controllers: "controllers only enqueue
/// jobs, workers execute them" is enforced by this module simply not
/// having any HTTP surface, not by convention alone. See
/// docs/adr/0003-recon-engine-module.md.
@Module({
  imports: [TargetsModule, EvidenceModule, AttachmentsModule],
  providers: [
    { provide: RECON_JOBS_REPOSITORY, useClass: PrismaReconJobsRepository },
    {
      provide: RECON_JOB_TOOL_RUNS_REPOSITORY,
      useClass: PrismaReconJobToolRunsRepository,
    },
    {
      provide: RECON_JOB_LOGS_REPOSITORY,
      useClass: PrismaReconJobLogsRepository,
    },
    {
      provide: RECON_FINDINGS_REPOSITORY,
      useClass: PrismaReconFindingsRepository,
    },
    ToolProcessSpawner,
    NmapToolRunner,
    SubfinderToolRunner,
    HttpxToolRunner,
    DnsxToolRunner,
    NaabuToolRunner,
    WhatWebToolRunner,
    AssetfinderToolRunner,
    GowitnessToolRunner,
    AmassToolRunner,
    KatanaToolRunner,
    GauToolRunner,
    WaybackurlsToolRunner,
    WhoisToolRunner,
    AsnToolRunner,
    NmapNormalizer,
    SubfinderNormalizer,
    HttpxNormalizer,
    DnsxNormalizer,
    NaabuNormalizer,
    WhatWebNormalizer,
    AssetfinderNormalizer,
    GowitnessNormalizer,
    AmassNormalizer,
    KatanaNormalizer,
    GauNormalizer,
    WaybackurlsNormalizer,
    WhoisNormalizer,
    AsnNormalizer,
    ToolRunnerRegistry,
    ReconJobExecutionService,
    ReconJobPollerService,
  ],
  exports: [
    RECON_JOBS_REPOSITORY,
    RECON_JOB_TOOL_RUNS_REPOSITORY,
    RECON_JOB_LOGS_REPOSITORY,
    RECON_FINDINGS_REPOSITORY,
    ReconJobExecutionService,
    ReconJobPollerService,
  ],
})
export class ReconCoreModule {}
