import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { NoteDto } from '@pentesthub/shared';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  PROJECTS_REPOSITORY,
  type ProjectsRepository,
} from '../../projects/domain/repositories/projects.repository.interface.js';
import {
  NOTES_REPOSITORY,
  type NotesRepository,
} from '../domain/repositories/notes.repository.interface.js';
import { resolveProjectInCallerWorkspace } from '../../../common/utils/project-access.util.js';
import { resolveNoteForCaller } from '../commands/note-lifecycle.commands.js';
import { toNoteDto } from '../mappers/to-note-dto.mapper.js';

export class GetNoteQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly noteId: string,
  ) {}
}

@QueryHandler(GetNoteQuery)
export class GetNoteHandler implements IQueryHandler<GetNoteQuery, NoteDto> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(NOTES_REPOSITORY) private readonly notesRepository: NotesRepository,
  ) {}

  async execute(query: GetNoteQuery): Promise<NoteDto> {
    const { note } = await resolveNoteForCaller(
      this.workspacesRepository,
      this.projectsRepository,
      this.notesRepository,
      query.userId,
      query.noteId,
    );
    return toNoteDto(note);
  }
}

export class ListNotesQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly projectId: string,
    public readonly targetId?: string,
  ) {}
}

@QueryHandler(ListNotesQuery)
export class ListNotesHandler implements IQueryHandler<
  ListNotesQuery,
  NoteDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(NOTES_REPOSITORY) private readonly notesRepository: NotesRepository,
  ) {}

  async execute(query: ListNotesQuery): Promise<NoteDto[]> {
    await resolveProjectInCallerWorkspace(
      this.workspacesRepository,
      this.projectsRepository,
      query.userId,
      query.projectId,
    );
    const notes = await this.notesRepository.list(
      query.projectId,
      query.targetId,
    );
    return notes.map(toNoteDto);
  }
}
