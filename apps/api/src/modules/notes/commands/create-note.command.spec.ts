import { describe, expect, it, jest } from '@jest/globals';
import { EventBus } from '@nestjs/cqrs';
import { CreateNoteHandler, CreateNoteCommand } from './create-note.command.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { Prisma } from '../../../prisma-types.js';
import type { WorkspacesRepository } from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import type {
  ProjectsRepository,
  ProjectWithTags,
} from '../../projects/domain/repositories/projects.repository.interface.js';
import type { NotesRepository } from '../domain/repositories/notes.repository.interface.js';
import type { Note, Workspace } from '../../../prisma-types.js';

describe('CreateNoteHandler', () => {
  const workspace = { id: 'ws-1' } as Workspace;
  const project = {
    id: 'proj-1',
    workspaceId: 'ws-1',
    tags: [],
  } as unknown as ProjectWithTags;
  const note = {
    id: 'note-1',
    projectId: 'proj-1',
    content: 'hi',
    targetId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Note;

  function build() {
    const workspacesRepository = {
      findPersonalWorkspaceForUser: jest
        .fn<WorkspacesRepository['findPersonalWorkspaceForUser']>()
        .mockResolvedValue(workspace),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    const projectsRepository = {
      findByIdForWorkspace: jest
        .fn<ProjectsRepository['findByIdForWorkspace']>()
        .mockResolvedValue(project),
    } as unknown as jest.Mocked<ProjectsRepository>;
    const notesRepository = {
      create: jest.fn<NotesRepository['create']>(),
    } as unknown as jest.Mocked<NotesRepository>;
    const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;
    return {
      handler: new CreateNoteHandler(
        workspacesRepository,
        projectsRepository,
        notesRepository,
        eventBus,
      ),
      notesRepository,
      eventBus,
    };
  }

  it('creates the note and publishes NoteCreatedEvent', async () => {
    const { handler, notesRepository, eventBus } = build();
    notesRepository.create.mockResolvedValue(note);

    const result = await handler.execute(
      new CreateNoteCommand('user-1', 'proj-1', { content: 'hi' }),
    );

    expect(result.id).toBe('note-1');
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ verb: 'note.created' }),
    );
  });

  it('maps a P2003 foreign-key violation on targetId to a clean INVALID_REFERENCE 400, not a raw 500', async () => {
    const { handler, notesRepository } = build();
    notesRepository.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed',
        {
          code: 'P2003',
          clientVersion: '7.8.0',
        },
      ),
    );

    await expect(
      handler.execute(
        new CreateNoteCommand('user-1', 'proj-1', {
          content: 'hi',
          targetId: 'nonexistent',
        }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_REFERENCE' });
  });

  it('re-throws non-P2003 errors unchanged (not misclassified as a bad reference)', async () => {
    const { handler, notesRepository } = build();
    const unrelated = new Error('connection reset');
    notesRepository.create.mockRejectedValue(unrelated);

    await expect(
      handler.execute(
        new CreateNoteCommand('user-1', 'proj-1', { content: 'hi' }),
      ),
    ).rejects.toBe(unrelated);
  });

  it('rejects with WORKSPACE_NOT_FOUND wrapped as AppException when caller has no workspace', async () => {
    const workspacesRepository = {
      findPersonalWorkspaceForUser: jest
        .fn<WorkspacesRepository['findPersonalWorkspaceForUser']>()
        .mockResolvedValue(null),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    const projectsRepository = {} as unknown as jest.Mocked<ProjectsRepository>;
    const notesRepository = {} as unknown as jest.Mocked<NotesRepository>;
    const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;
    const handler = new CreateNoteHandler(
      workspacesRepository,
      projectsRepository,
      notesRepository,
      eventBus,
    );

    await expect(
      handler.execute(
        new CreateNoteCommand('user-1', 'proj-1', { content: 'hi' }),
      ),
    ).rejects.toBeInstanceOf(AppException);
  });
});
