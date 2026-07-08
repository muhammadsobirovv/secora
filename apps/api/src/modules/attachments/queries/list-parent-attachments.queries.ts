import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { AttachmentDto } from '@pentesthub/shared';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  PROJECTS_REPOSITORY,
  type ProjectsRepository,
} from '../../projects/domain/repositories/projects.repository.interface.js';
import {
  TARGETS_REPOSITORY,
  type TargetsRepository,
} from '../../targets/domain/repositories/targets.repository.interface.js';
import {
  NOTES_REPOSITORY,
  type NotesRepository,
} from '../../notes/domain/repositories/notes.repository.interface.js';
import {
  EVIDENCE_REPOSITORY,
  type EvidenceRepository,
} from '../../evidence/domain/repositories/evidence.repository.interface.js';
import { resolveProjectInCallerWorkspace } from '../../../common/utils/project-access.util.js';
import { resolveTargetForCaller } from '../../targets/commands/target-lifecycle.commands.js';
import { resolveNoteForCaller } from '../../notes/commands/note-lifecycle.commands.js';
import { resolveEvidenceForCaller } from '../../evidence/commands/evidence-lifecycle.commands.js';
import {
  ListAttachmentsQuery,
  ListAttachmentsHandler,
} from './list-attachments.query.js';
import { QueryBus } from '@nestjs/cqrs';

/// Thin, authorization-checking wrappers around ListAttachmentsQuery — one
/// per parent type, each reusing that parent module's own "resolve for
/// caller" helper before delegating. Keeps the authorization check inside
/// the CQRS handler layer (not the controller) while ListAttachmentsQuery
/// itself stays a simple, reusable, non-authorizing read.

export class ListProjectAttachmentsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly projectId: string,
  ) {}
}

@QueryHandler(ListProjectAttachmentsQuery)
export class ListProjectAttachmentsHandler implements IQueryHandler<
  ListProjectAttachmentsQuery,
  AttachmentDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(query: ListProjectAttachmentsQuery): Promise<AttachmentDto[]> {
    await resolveProjectInCallerWorkspace(
      this.workspacesRepository,
      this.projectsRepository,
      query.userId,
      query.projectId,
    );
    return this.queryBus.execute(
      new ListAttachmentsQuery('PROJECT', query.projectId),
    );
  }
}

export class ListTargetAttachmentsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly targetId: string,
  ) {}
}

@QueryHandler(ListTargetAttachmentsQuery)
export class ListTargetAttachmentsHandler implements IQueryHandler<
  ListTargetAttachmentsQuery,
  AttachmentDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(TARGETS_REPOSITORY)
    private readonly targetsRepository: TargetsRepository,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(query: ListTargetAttachmentsQuery): Promise<AttachmentDto[]> {
    await resolveTargetForCaller(
      this.workspacesRepository,
      this.projectsRepository,
      this.targetsRepository,
      query.userId,
      query.targetId,
    );
    return this.queryBus.execute(
      new ListAttachmentsQuery('TARGET', query.targetId),
    );
  }
}

export class ListNoteAttachmentsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly noteId: string,
  ) {}
}

@QueryHandler(ListNoteAttachmentsQuery)
export class ListNoteAttachmentsHandler implements IQueryHandler<
  ListNoteAttachmentsQuery,
  AttachmentDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(NOTES_REPOSITORY) private readonly notesRepository: NotesRepository,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(query: ListNoteAttachmentsQuery): Promise<AttachmentDto[]> {
    await resolveNoteForCaller(
      this.workspacesRepository,
      this.projectsRepository,
      this.notesRepository,
      query.userId,
      query.noteId,
    );
    return this.queryBus.execute(
      new ListAttachmentsQuery('NOTE', query.noteId),
    );
  }
}

export class ListEvidenceAttachmentsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly evidenceId: string,
  ) {}
}

@QueryHandler(ListEvidenceAttachmentsQuery)
export class ListEvidenceAttachmentsHandler implements IQueryHandler<
  ListEvidenceAttachmentsQuery,
  AttachmentDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(EVIDENCE_REPOSITORY)
    private readonly evidenceRepository: EvidenceRepository,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(query: ListEvidenceAttachmentsQuery): Promise<AttachmentDto[]> {
    await resolveEvidenceForCaller(
      this.workspacesRepository,
      this.projectsRepository,
      this.evidenceRepository,
      query.userId,
      query.evidenceId,
    );
    return this.queryBus.execute(
      new ListAttachmentsQuery('EVIDENCE', query.evidenceId),
    );
  }
}

export { ListAttachmentsHandler };
