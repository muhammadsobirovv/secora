import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { TargetsModule } from '../targets/targets.module.js';
import { NotesModule } from '../notes/notes.module.js';
import { EvidenceModule } from '../evidence/evidence.module.js';
import { ATTACHMENTS_REPOSITORY } from './domain/repositories/attachments.repository.interface.js';
import { PrismaAttachmentsRepository } from './infrastructure/persistence/prisma/prisma-attachments.repository.js';
import { UploadAttachmentHandler } from './commands/upload-attachment.command.js';
import { DeleteAttachmentHandler } from './commands/delete-attachment.command.js';
import { ListAttachmentsHandler } from './queries/list-attachments.query.js';
import {
  ListEvidenceAttachmentsHandler,
  ListNoteAttachmentsHandler,
  ListProjectAttachmentsHandler,
  ListTargetAttachmentsHandler,
} from './queries/list-parent-attachments.queries.js';
import { AttachmentsController } from './controllers/attachments.controller.js';
import {
  EvidenceAttachmentsController,
  NoteAttachmentsController,
  ProjectAttachmentsController,
  TargetAttachmentsController,
} from './controllers/parent-attachments.controllers.js';

@Module({
  imports: [
    WorkspacesModule,
    ProjectsModule,
    TargetsModule,
    NotesModule,
    EvidenceModule,
  ],
  controllers: [
    AttachmentsController,
    ProjectAttachmentsController,
    TargetAttachmentsController,
    NoteAttachmentsController,
    EvidenceAttachmentsController,
  ],
  providers: [
    { provide: ATTACHMENTS_REPOSITORY, useClass: PrismaAttachmentsRepository },
    UploadAttachmentHandler,
    DeleteAttachmentHandler,
    ListAttachmentsHandler,
    ListProjectAttachmentsHandler,
    ListTargetAttachmentsHandler,
    ListNoteAttachmentsHandler,
    ListEvidenceAttachmentsHandler,
  ],
  exports: [ATTACHMENTS_REPOSITORY],
})
export class AttachmentsModule {}
