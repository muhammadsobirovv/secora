import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type {
  CreateKnowledgeBaseNoteRequestDto,
  KnowledgeBaseNoteDto,
  SaveConversationSnapshotRequestDto,
  UpdateKnowledgeBaseNoteRequestDto,
} from '@pentesthub/shared';
import type { Prisma } from '../../../prisma-types.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  KNOWLEDGE_BASE_REPOSITORY,
  type KnowledgeBaseRepository,
} from '../domain/repositories/knowledge-base.repository.interface.js';
import {
  AI_CONVERSATIONS_REPOSITORY,
  type AiConversationsRepository,
} from '../../ai/domain/repositories/ai-conversations.repository.interface.js';
import {
  AI_MESSAGES_REPOSITORY,
  type AiMessagesRepository,
} from '../../ai/domain/repositories/ai-messages.repository.interface.js';
import { resolveAiConversationForCaller } from '../../ai/ai-authorization.util.js';
import { resolveWorkspaceForCaller } from '../authorization.util.js';
import { toKnowledgeBaseNoteDto } from '../mappers/to-knowledge-base-note-dto.mapper.js';

async function resolveKnowledgeBaseNoteForCaller(
  workspacesRepository: WorkspacesRepository,
  notesRepository: KnowledgeBaseRepository,
  userId: string,
  noteId: string,
) {
  const workspace = await resolveWorkspaceForCaller(
    workspacesRepository,
    userId,
  );
  const note = await notesRepository.findByIdForWorkspace(noteId, workspace.id);
  if (!note) {
    throw new AppException(
      'KNOWLEDGE_BASE_NOTE_NOT_FOUND',
      'Knowledge base note not found.',
      HttpStatus.NOT_FOUND,
    );
  }
  return { workspaceId: workspace.id, note };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export class CreateKnowledgeBaseNoteCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: CreateKnowledgeBaseNoteRequestDto,
  ) {}
}

@CommandHandler(CreateKnowledgeBaseNoteCommand)
export class CreateKnowledgeBaseNoteHandler implements ICommandHandler<
  CreateKnowledgeBaseNoteCommand,
  KnowledgeBaseNoteDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(KNOWLEDGE_BASE_REPOSITORY)
    private readonly notesRepository: KnowledgeBaseRepository,
  ) {}

  async execute(
    command: CreateKnowledgeBaseNoteCommand,
  ): Promise<KnowledgeBaseNoteDto> {
    const workspace = await resolveWorkspaceForCaller(
      this.workspacesRepository,
      command.userId,
    );

    const note = await this.notesRepository.create({
      workspaceId: workspace.id,
      projectId: command.data.projectId,
      targetId: command.data.targetId,
      findingId: command.data.findingId,
      reportId: command.data.reportId,
      title: command.data.title,
      contentMarkdown: command.data.contentMarkdown,
      checklist: command.data.checklist as Prisma.InputJsonValue | undefined,
      authorId: command.userId,
      kind: command.data.kind,
      tags: command.data.tags,
      cveId: command.data.cveId,
    });

    return toKnowledgeBaseNoteDto(note);
  }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export class UpdateKnowledgeBaseNoteCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly noteId: string,
    public readonly data: UpdateKnowledgeBaseNoteRequestDto,
  ) {}
}

@CommandHandler(UpdateKnowledgeBaseNoteCommand)
export class UpdateKnowledgeBaseNoteHandler implements ICommandHandler<
  UpdateKnowledgeBaseNoteCommand,
  KnowledgeBaseNoteDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(KNOWLEDGE_BASE_REPOSITORY)
    private readonly notesRepository: KnowledgeBaseRepository,
  ) {}

  async execute(
    command: UpdateKnowledgeBaseNoteCommand,
  ): Promise<KnowledgeBaseNoteDto> {
    await resolveKnowledgeBaseNoteForCaller(
      this.workspacesRepository,
      this.notesRepository,
      command.userId,
      command.noteId,
    );

    const updated = await this.notesRepository.update(command.noteId, {
      targetId: command.data.targetId,
      findingId: command.data.findingId,
      reportId: command.data.reportId,
      title: command.data.title,
      contentMarkdown: command.data.contentMarkdown,
      checklist: command.data.checklist as Prisma.InputJsonValue | undefined,
      kind: command.data.kind,
      tags: command.data.tags,
      cveId: command.data.cveId,
    });

    return toKnowledgeBaseNoteDto(updated);
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export class DeleteKnowledgeBaseNoteCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly noteId: string,
  ) {}
}

@CommandHandler(DeleteKnowledgeBaseNoteCommand)
export class DeleteKnowledgeBaseNoteHandler implements ICommandHandler<
  DeleteKnowledgeBaseNoteCommand,
  void
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(KNOWLEDGE_BASE_REPOSITORY)
    private readonly notesRepository: KnowledgeBaseRepository,
  ) {}

  async execute(command: DeleteKnowledgeBaseNoteCommand): Promise<void> {
    await resolveKnowledgeBaseNoteForCaller(
      this.workspacesRepository,
      this.notesRepository,
      command.userId,
      command.noteId,
    );
    await this.notesRepository.softDelete(command.noteId);
  }
}

// ---------------------------------------------------------------------------
// Save Conversation Snapshot — copy an AI conversation into the Knowledge
// Base as a `kind: AI_CONVERSATION_SNAPSHOT` entry. A point-in-time copy
// (Markdown transcript), not a live link — see the Prisma schema's
// `sourceConversationId` doc comment: it survives the source conversation
// being deleted or edited later.
// ---------------------------------------------------------------------------

export class SaveConversationSnapshotCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: SaveConversationSnapshotRequestDto,
  ) {}
}

const ROLE_LABELS: Record<string, string> = {
  SYSTEM: 'System',
  USER: 'You',
  ASSISTANT: 'Assistant',
  TOOL: 'Tool',
};

@CommandHandler(SaveConversationSnapshotCommand)
export class SaveConversationSnapshotHandler implements ICommandHandler<
  SaveConversationSnapshotCommand,
  KnowledgeBaseNoteDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(KNOWLEDGE_BASE_REPOSITORY)
    private readonly notesRepository: KnowledgeBaseRepository,
    @Inject(AI_CONVERSATIONS_REPOSITORY)
    private readonly conversationsRepository: AiConversationsRepository,
    @Inject(AI_MESSAGES_REPOSITORY)
    private readonly messagesRepository: AiMessagesRepository,
  ) {}

  async execute(
    command: SaveConversationSnapshotCommand,
  ): Promise<KnowledgeBaseNoteDto> {
    const workspace = await resolveWorkspaceForCaller(
      this.workspacesRepository,
      command.userId,
    );
    const conversation = await resolveAiConversationForCaller(
      this.conversationsRepository,
      this.workspacesRepository,
      command.userId,
      command.data.conversationId,
    );
    const messages = await this.messagesRepository.listForConversation(
      conversation.id,
    );

    const title =
      command.data.title ??
      conversation.title ??
      `Conversation snapshot — ${new Date().toISOString().slice(0, 10)}`;

    const transcript = messages
      .filter((message) => message.status !== 'FAILED')
      .map((message) => {
        const label = ROLE_LABELS[message.role] ?? message.role;
        return `**${label}:**\n\n${message.content}`;
      })
      .join('\n\n---\n\n');

    const note = await this.notesRepository.create({
      workspaceId: workspace.id,
      projectId: conversation.projectId,
      title,
      contentMarkdown:
        transcript.length > 0
          ? transcript
          : '_This conversation has no messages yet._',
      authorId: command.userId,
      kind: 'AI_CONVERSATION_SNAPSHOT',
      tags: command.data.tags ?? [],
      sourceConversationId: conversation.id,
    });

    return toKnowledgeBaseNoteDto(note);
  }
}
