import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { NOTES_REPOSITORY } from './domain/repositories/notes.repository.interface.js';
import { PrismaNotesRepository } from './infrastructure/persistence/prisma/prisma-notes.repository.js';
import { CreateNoteHandler } from './commands/create-note.command.js';
import {
  UpdateNoteHandler,
  DeleteNoteHandler,
} from './commands/note-lifecycle.commands.js';
import { GetNoteHandler, ListNotesHandler } from './queries/note.queries.js';
import { NotesController } from './controllers/notes.controller.js';
import { ProjectNotesController } from './controllers/project-notes.controller.js';

@Module({
  imports: [WorkspacesModule, ProjectsModule],
  controllers: [NotesController, ProjectNotesController],
  providers: [
    { provide: NOTES_REPOSITORY, useClass: PrismaNotesRepository },
    CreateNoteHandler,
    UpdateNoteHandler,
    DeleteNoteHandler,
    GetNoteHandler,
    ListNotesHandler,
  ],
  exports: [NOTES_REPOSITORY],
})
export class NotesModule {}
