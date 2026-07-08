import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { EVIDENCE_REPOSITORY } from './domain/repositories/evidence.repository.interface.js';
import { PrismaEvidenceRepository } from './infrastructure/persistence/prisma/prisma-evidence.repository.js';
import { CreateEvidenceHandler } from './commands/create-evidence.command.js';
import {
  UpdateEvidenceHandler,
  DeleteEvidenceHandler,
} from './commands/evidence-lifecycle.commands.js';
import {
  GetEvidenceHandler,
  ListEvidenceHandler,
} from './queries/evidence.queries.js';
import { EvidenceController } from './controllers/evidence.controller.js';
import { ProjectEvidenceController } from './controllers/project-evidence.controller.js';

@Module({
  imports: [WorkspacesModule, ProjectsModule],
  controllers: [EvidenceController, ProjectEvidenceController],
  providers: [
    { provide: EVIDENCE_REPOSITORY, useClass: PrismaEvidenceRepository },
    CreateEvidenceHandler,
    UpdateEvidenceHandler,
    DeleteEvidenceHandler,
    GetEvidenceHandler,
    ListEvidenceHandler,
  ],
  exports: [EVIDENCE_REPOSITORY],
})
export class EvidenceModule {}
