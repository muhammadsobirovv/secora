import { HttpStatus, Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type {
  KnowledgeBaseNoteDto,
  ListKnowledgeBaseNotesQueryDto,
} from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  KNOWLEDGE_BASE_REPOSITORY,
  type KnowledgeBaseRepository,
} from '../domain/repositories/knowledge-base.repository.interface.js';
import { resolveWorkspaceForCaller } from '../authorization.util.js';
import { toKnowledgeBaseNoteDto } from '../mappers/to-knowledge-base-note-dto.mapper.js';

export class ListKnowledgeBaseNotesQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly filter: ListKnowledgeBaseNotesQueryDto,
  ) {}
}

@QueryHandler(ListKnowledgeBaseNotesQuery)
export class ListKnowledgeBaseNotesHandler implements IQueryHandler<
  ListKnowledgeBaseNotesQuery,
  KnowledgeBaseNoteDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(KNOWLEDGE_BASE_REPOSITORY)
    private readonly notesRepository: KnowledgeBaseRepository,
  ) {}

  async execute(
    query: ListKnowledgeBaseNotesQuery,
  ): Promise<KnowledgeBaseNoteDto[]> {
    const workspace = await resolveWorkspaceForCaller(
      this.workspacesRepository,
      query.userId,
    );

    const notes = await this.notesRepository.list({
      workspaceId: workspace.id,
      projectId: query.filter.projectId,
      targetId: query.filter.targetId,
      findingId: query.filter.findingId,
      reportId: query.filter.reportId,
      search: query.filter.search,
      kind: query.filter.kind,
      tag: query.filter.tag,
    });

    return notes.map(toKnowledgeBaseNoteDto);
  }
}

export class GetKnowledgeBaseNoteQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly noteId: string,
  ) {}
}

@QueryHandler(GetKnowledgeBaseNoteQuery)
export class GetKnowledgeBaseNoteHandler implements IQueryHandler<
  GetKnowledgeBaseNoteQuery,
  KnowledgeBaseNoteDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(KNOWLEDGE_BASE_REPOSITORY)
    private readonly notesRepository: KnowledgeBaseRepository,
  ) {}

  async execute(
    query: GetKnowledgeBaseNoteQuery,
  ): Promise<KnowledgeBaseNoteDto> {
    const workspace = await resolveWorkspaceForCaller(
      this.workspacesRepository,
      query.userId,
    );
    const note = await this.notesRepository.findByIdForWorkspace(
      query.noteId,
      workspace.id,
    );
    if (!note) {
      throw new AppException(
        'KNOWLEDGE_BASE_NOTE_NOT_FOUND',
        'Knowledge base note not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return toKnowledgeBaseNoteDto(note);
  }
}
