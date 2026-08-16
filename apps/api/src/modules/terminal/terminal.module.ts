import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { TargetsModule } from '../targets/targets.module.js';
import { ReconCoreModule } from '../recon/recon-core.module.js';
import { VulnCoreModule } from '../vuln/vuln-core.module.js';
import { SecurityModule } from '../security/security.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { ADHOC_COMMANDS_REPOSITORY } from './domain/repositories/adhoc-commands.repository.interface.js';
import { PrismaAdHocCommandsRepository } from './infrastructure/persistence/prisma/prisma-adhoc-commands.repository.js';
import { AdHocCommandService } from './ad-hoc-command.service.js';
import { TerminalController } from './controllers/terminal.controller.js';

/// Module 16 — Terminal workspace + safe command execution (task #388).
/// Imports ReconCoreModule/VulnCoreModule (not just their HTTP siblings)
/// specifically for ToolRunnerRegistry/ScannerRunnerRegistry — the
/// canonical execution layer this module reuses rather than
/// reimplementing. SecurityModule brings in ScopeEngineService/
/// GlobalSecurityPolicyService/SecurityApprovalService, the three gates
/// AdHocCommandService is required to call, in order, before any tool
/// runs. See ad-hoc-command.service.ts's doc comment for the full chain.
@Module({
  imports: [
    WorkspacesModule,
    ProjectsModule,
    TargetsModule,
    ReconCoreModule,
    VulnCoreModule,
    SecurityModule,
    AuditModule,
  ],
  controllers: [TerminalController],
  providers: [
    { provide: ADHOC_COMMANDS_REPOSITORY, useClass: PrismaAdHocCommandsRepository },
    AdHocCommandService,
  ],
  exports: [AdHocCommandService],
})
export class TerminalModule {}
