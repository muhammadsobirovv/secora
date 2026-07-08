import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { CreateNoteRequestDto, NoteDto } from '@pentesthub/shared';
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
import { runOrMapInvalidReference } from '../../../common/utils/prisma-error.util.js';
import { toNoteDto } from '../mappers/to-note-dto.mapper.js';
import { NoteCreatedEvent } from '../events/note-events.js';

export class CreateNoteCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly projectId: string,
    public readonly data: CreateNoteRequestDto,
  ) {}
}

@CommandHandler(CreateNoteCommand)
export class CreateNoteHandler implements ICommandHandler<
  CreateNoteCommand,
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

  async execute(command: CreateNoteCommand): Promise<NoteDto> {
    const { workspace } = await resolveProjectInCallerWorkspace(
      this.workspacesRepository,
      this.projectsRepository,
      command.userId,
      command.projectId,
    );

    const note = await runOrMapInvalidReference(() =>
      this.notesRepository.create({
        projectId: command.projectId,
        targetId: command.data.targetId,
        title: command.data.title,
        content: command.data.content,
        authorId: command.userId,
      }),
    );

    this.eventBus.publish(
      new NoteCreatedEvent(
        workspace.id,
        command.projectId,
        command.userId,
        note.id,
      ),
    );

    return toNoteDto(note);
  }
}
