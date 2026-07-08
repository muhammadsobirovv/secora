import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type { NoteDto, UpdateNoteRequestDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
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
import { runOrMapInvalidReference } from '../../../common/utils/prisma-error.util.js';
import { toNoteDto } from '../mappers/to-note-dto.mapper.js';
import { NoteDeletedEvent, NoteUpdatedEvent } from '../events/note-events.js';
import type { Note } from '../../../prisma-types.js';

export async function resolveNoteForCaller(
  workspacesRepository: WorkspacesRepository,
  projectsRepository: ProjectsRepository,
  notesRepository: NotesRepository,
  userId: string,
  noteId: string,
): Promise<{ workspaceId: string; note: Note }> {
  const note = await notesRepository.findById(noteId);
  if (!note) {
    throw new AppException(
      'NOTE_NOT_FOUND',
      'Note not found.',
      HttpStatus.NOT_FOUND,
    );
  }
  const workspace =
    await workspacesRepository.findPersonalWorkspaceForUser(userId);
  if (!workspace) {
    throw new AppException(
      'WORKSPACE_NOT_FOUND',
      'Workspace not found.',
      HttpStatus.NOT_FOUND,
    );
  }
  const project = await projectsRepository.findByIdForWorkspace(
    note.projectId,
    workspace.id,
  );
  if (!project) {
    throw new AppException(
      'NOTE_NOT_FOUND',
      'Note not found.',
      HttpStatus.NOT_FOUND,
    );
  }
  return { workspaceId: workspace.id, note };
}

export class UpdateNoteCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly noteId: string,
    public readonly data: UpdateNoteRequestDto,
  ) {}
}

@CommandHandler(UpdateNoteCommand)
export class UpdateNoteHandler implements ICommandHandler<
  UpdateNoteCommand,
  NoteDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(NOTES_REPOSITORY) private readonly notesRepository: NotesRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: UpdateNoteCommand): Promise<NoteDto> {
    const { workspaceId, note } = await resolveNoteForCaller(
      this.workspacesRepository,
      this.projectsRepository,
      this.notesRepository,
      command.userId,
      command.noteId,
    );
    const updated = await runOrMapInvalidReference(() =>
      this.notesRepository.update(command.noteId, command.data),
    );
    this.eventBus.publish(
      new NoteUpdatedEvent(
        workspaceId,
        note.projectId,
        command.userId,
        command.noteId,
      ),
    );
    return toNoteDto(updated);
  }
}

export class DeleteNoteCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly noteId: string,
  ) {}
}

@CommandHandler(DeleteNoteCommand)
export class DeleteNoteHandler implements ICommandHandler<
  DeleteNoteCommand,
  void
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(NOTES_REPOSITORY) private readonly notesRepository: NotesRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: DeleteNoteCommand): Promise<void> {
    const { workspaceId, note } = await resolveNoteForCaller(
      this.workspacesRepository,
      this.projectsRepository,
      this.notesRepository,
      command.userId,
      command.noteId,
    );
    await this.notesRepository.softDelete(command.noteId);
    this.eventBus.publish(
      new NoteDeletedEvent(
        workspaceId,
        note.projectId,
        command.userId,
        command.noteId,
      ),
    );
  }
}
