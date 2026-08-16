import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { TargetsModule } from '../targets/targets.module.js';
import { SecurityModule } from '../security/security.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { TerminalModule } from '../terminal/terminal.module.js';
import { EvidenceModule } from '../evidence/evidence.module.js';
import { PLAYBOOKS_REPOSITORY } from './domain/repositories/playbooks.repository.interface.js';
import { PrismaPlaybooksRepository } from './infrastructure/persistence/prisma/prisma-playbooks.repository.js';
import { PLAYBOOK_EXECUTIONS_REPOSITORY } from './domain/repositories/playbook-executions.repository.interface.js';
import { PrismaPlaybookExecutionsRepository } from './infrastructure/persistence/prisma/prisma-playbook-executions.repository.js';
import { PlaybookValidationService } from './playbook-validation.service.js';
import { PlaybookExecutionService } from './playbook-execution.service.js';
import { PlaybookSeedService } from './seed/playbook-seed.service.js';
import {
  ArchivePlaybookHandler,
  ClonePlaybookHandler,
  CreatePlaybookHandler,
  PublishPlaybookHandler,
  UpdatePlaybookDraftHandler,
} from './commands/playbook-lifecycle.commands.js';
import { DecidePlaybookApprovalHandler } from './commands/decide-playbook-approval.command.js';
import { GetPlaybookHandler, ListPlaybooksHandler } from './queries/playbook.queries.js';
import {
  GetPlaybookExecutionHandler,
  ListPlaybookApprovalsHandler,
  ListPlaybookExecutionsHandler,
} from './queries/playbook-execution.queries.js';
import { PlaybooksController } from './controllers/playbooks.controller.js';
import { PlaybookExecutionsController } from './controllers/playbook-executions.controller.js';

/// Module 16 — Playbooks + Playbook Builder (task #389). Imports
/// TerminalModule (for `AdHocCommandService`, the tool-invoking step
/// dispatch target) and EvidenceModule (for `EVIDENCE_REPOSITORY`) rather
/// than reimplementing either — see PlaybookExecutionService's doc
/// comment for the full per-step-type dispatch table. SecurityModule
/// brings in `ScopeEngineService`/`SecurityApprovalService`, the same
/// gates every other Module 16 execution surface uses.
@Module({
  imports: [
    WorkspacesModule,
    ProjectsModule,
    TargetsModule,
    SecurityModule,
    AuditModule,
    TerminalModule,
    EvidenceModule,
  ],
  controllers: [PlaybooksController, PlaybookExecutionsController],
  providers: [
    { provide: PLAYBOOKS_REPOSITORY, useClass: PrismaPlaybooksRepository },
    { provide: PLAYBOOK_EXECUTIONS_REPOSITORY, useClass: PrismaPlaybookExecutionsRepository },
    PlaybookValidationService,
    PlaybookExecutionService,
    PlaybookSeedService,
    CreatePlaybookHandler,
    UpdatePlaybookDraftHandler,
    PublishPlaybookHandler,
    ClonePlaybookHandler,
    ArchivePlaybookHandler,
    DecidePlaybookApprovalHandler,
    ListPlaybooksHandler,
    GetPlaybookHandler,
    ListPlaybookExecutionsHandler,
    GetPlaybookExecutionHandler,
    ListPlaybookApprovalsHandler,
  ],
  exports: [PLAYBOOKS_REPOSITORY, PLAYBOOK_EXECUTIONS_REPOSITORY, PlaybookExecutionService],
})
export class PlaybooksModule {}
