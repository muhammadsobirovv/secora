import { CommandHandler, EventBus, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type {
  CreatePlaybookRequestDto,
  PlaybookDto,
  UpdatePlaybookDraftRequestDto,
} from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  PLAYBOOKS_REPOSITORY,
  type PlaybooksRepository,
} from '../domain/repositories/playbooks.repository.interface.js';
import { PlaybookValidationService } from '../playbook-validation.service.js';
import { toPlaybookDto } from '../mappers/to-playbook-dto.mapper.js';
import {
  PlaybookArchivedEvent,
  PlaybookClonedEvent,
  PlaybookCreatedEvent,
  PlaybookPublishedEvent,
} from '../events/playbook-events.js';

async function resolveWorkspace(workspacesRepository: WorkspacesRepository, userId: string): Promise<string> {
  const workspace = await workspacesRepository.findPersonalWorkspaceForUser(userId);
  if (!workspace) {
    throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
  }
  return workspace.id;
}

/// Enumeration-safe: a playbook belonging to another workspace 404s
/// identically to one that doesn't exist — mirrors every other Module 16
/// lifecycle handler's resolution pattern.
async function resolvePlaybookForCaller(
  workspacesRepository: WorkspacesRepository,
  playbooksRepository: PlaybooksRepository,
  userId: string,
  playbookId: string,
) {
  const workspaceId = await resolveWorkspace(workspacesRepository, userId);
  const playbook = await playbooksRepository.findByIdForWorkspace(playbookId, workspaceId);
  if (!playbook) {
    throw new AppException('PLAYBOOK_NOT_FOUND', 'Playbook not found.', HttpStatus.NOT_FOUND);
  }
  return { workspaceId, playbook };
}

// ---------------------------------------------------------------------------
// Create draft
// ---------------------------------------------------------------------------

export class CreatePlaybookCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: CreatePlaybookRequestDto,
  ) {}
}

@CommandHandler(CreatePlaybookCommand)
export class CreatePlaybookHandler implements ICommandHandler<CreatePlaybookCommand, PlaybookDto> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PLAYBOOKS_REPOSITORY) private readonly playbooksRepository: PlaybooksRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CreatePlaybookCommand): Promise<PlaybookDto> {
    const workspaceId = await resolveWorkspace(this.workspacesRepository, command.userId);
    const playbook = await this.playbooksRepository.create({
      workspaceId,
      name: command.data.name,
      description: command.data.description ?? null,
      category: command.data.category,
      createdBy: command.userId,
    });
    const version = await this.playbooksRepository.createVersion({
      playbookId: playbook.id,
      version: 1,
      graph: command.data.graph,
      variables: command.data.variables ?? [],
      createdBy: command.userId,
    });
    const updated = await this.playbooksRepository.update(playbook.id, { currentVersionId: version.id });

    this.eventBus.publish(new PlaybookCreatedEvent(workspaceId, command.userId, playbook.id, { name: playbook.name }));
    return toPlaybookDto(updated);
  }
}

// ---------------------------------------------------------------------------
// Update draft — creates a new (unpublished) version; never mutates a
// version that has already been published, so "each execution must
// preserve the exact version used" holds even while the playbook is being
// actively edited after a previous publish.
// ---------------------------------------------------------------------------

export class UpdatePlaybookDraftCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly playbookId: string,
    public readonly data: UpdatePlaybookDraftRequestDto,
  ) {}
}

@CommandHandler(UpdatePlaybookDraftCommand)
export class UpdatePlaybookDraftHandler implements ICommandHandler<UpdatePlaybookDraftCommand, PlaybookDto> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PLAYBOOKS_REPOSITORY) private readonly playbooksRepository: PlaybooksRepository,
  ) {}

  async execute(command: UpdatePlaybookDraftCommand): Promise<PlaybookDto> {
    const { workspaceId, playbook } = await resolvePlaybookForCaller(
      this.workspacesRepository,
      this.playbooksRepository,
      command.userId,
      command.playbookId,
    );
    if (playbook.status === 'ARCHIVED') {
      throw new AppException('PLAYBOOK_INVALID_STATE_TRANSITION', 'An archived playbook cannot be edited.', HttpStatus.CONFLICT);
    }

    let currentVersionId = playbook.currentVersionId;
    if (command.data.graph || command.data.variables) {
      const latest = await this.playbooksRepository.findLatestVersion(playbook.id);
      const isLatestPublished = Boolean(latest?.publishedAt);
      const nextVersionNumber = (latest?.version ?? 0) + 1;
      const graph = command.data.graph ?? (latest?.graph as never);
      const variables = command.data.variables ?? (latest?.variables as never) ?? [];

      if (!isLatestPublished && latest) {
        // Latest version is still a draft — safe to overwrite in place by
        // creating the same version number's replacement is not possible
        // (Prisma unique constraint), so we still create version N+1 but
        // it behaves as "the draft" until published; the previously
        // unpublished draft version is simply superseded and never
        // referenced by any execution (executions can only reference a
        // *published* version's id — see PlaybookExecutionService).
      }
      const version = await this.playbooksRepository.createVersion({
        playbookId: playbook.id,
        version: nextVersionNumber,
        graph,
        variables,
        createdBy: command.userId,
      });
      currentVersionId = playbook.status === 'DRAFT' ? version.id : playbook.currentVersionId;
      void workspaceId;
    }

    const updated = await this.playbooksRepository.update(playbook.id, {
      name: command.data.name,
      description: command.data.description,
      category: command.data.category,
      ...(playbook.status === 'DRAFT' ? { currentVersionId } : {}),
    });
    return toPlaybookDto(updated);
  }
}

// ---------------------------------------------------------------------------
// Publish — runs PlaybookValidationService first; refuses to publish an
// unsafe graph (spec: "safety validation before publishing... reject
// unsafe configs").
// ---------------------------------------------------------------------------

export class PublishPlaybookCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly playbookId: string,
  ) {}
}

@CommandHandler(PublishPlaybookCommand)
export class PublishPlaybookHandler implements ICommandHandler<PublishPlaybookCommand, PlaybookDto> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PLAYBOOKS_REPOSITORY) private readonly playbooksRepository: PlaybooksRepository,
    private readonly validation: PlaybookValidationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: PublishPlaybookCommand): Promise<PlaybookDto> {
    const { workspaceId, playbook } = await resolvePlaybookForCaller(
      this.workspacesRepository,
      this.playbooksRepository,
      command.userId,
      command.playbookId,
    );
    const latest = await this.playbooksRepository.findLatestVersion(playbook.id);
    if (!latest) {
      throw new AppException('PLAYBOOK_VERSION_NOT_FOUND', 'Playbook has no version to publish.', HttpStatus.NOT_FOUND);
    }

    const result = this.validation.validate(latest.graph as never);
    if (!result.valid) {
      throw new AppException(
        'PLAYBOOK_VALIDATION_FAILED',
        `Playbook failed safety validation: ${result.issues.filter((i) => i.severity === 'ERROR').map((i) => i.message).join('; ')}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.playbooksRepository.publishVersion(latest.id, { publishedBy: command.userId });
    const updated = await this.playbooksRepository.update(playbook.id, {
      status: 'PUBLISHED',
      currentVersionId: latest.id,
    });

    this.eventBus.publish(new PlaybookPublishedEvent(workspaceId, command.userId, playbook.id, { version: latest.version }));
    return toPlaybookDto(updated);
  }
}

// ---------------------------------------------------------------------------
// Clone
// ---------------------------------------------------------------------------

export class ClonePlaybookCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly playbookId: string,
  ) {}
}

@CommandHandler(ClonePlaybookCommand)
export class ClonePlaybookHandler implements ICommandHandler<ClonePlaybookCommand, PlaybookDto> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PLAYBOOKS_REPOSITORY) private readonly playbooksRepository: PlaybooksRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: ClonePlaybookCommand): Promise<PlaybookDto> {
    const { workspaceId, playbook } = await resolvePlaybookForCaller(
      this.workspacesRepository,
      this.playbooksRepository,
      command.userId,
      command.playbookId,
    );
    const sourceVersion = playbook.currentVersionId
      ? await this.playbooksRepository.findVersionById(playbook.currentVersionId)
      : await this.playbooksRepository.findLatestVersion(playbook.id);
    if (!sourceVersion) {
      throw new AppException('PLAYBOOK_VERSION_NOT_FOUND', 'Playbook has no version to clone.', HttpStatus.NOT_FOUND);
    }

    const clone = await this.playbooksRepository.create({
      workspaceId,
      name: `${playbook.name} (copy)`,
      description: playbook.description,
      category: playbook.category,
      isBuiltIn: false,
      createdBy: command.userId,
    });
    const version = await this.playbooksRepository.createVersion({
      playbookId: clone.id,
      version: 1,
      graph: sourceVersion.graph as never,
      variables: sourceVersion.variables as never,
      createdBy: command.userId,
    });
    const updated = await this.playbooksRepository.update(clone.id, { currentVersionId: version.id });

    this.eventBus.publish(new PlaybookClonedEvent(workspaceId, command.userId, clone.id, { sourcePlaybookId: playbook.id }));
    return toPlaybookDto(updated);
  }
}

// ---------------------------------------------------------------------------
// Archive
// ---------------------------------------------------------------------------

export class ArchivePlaybookCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly playbookId: string,
  ) {}
}

@CommandHandler(ArchivePlaybookCommand)
export class ArchivePlaybookHandler implements ICommandHandler<ArchivePlaybookCommand, PlaybookDto> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PLAYBOOKS_REPOSITORY) private readonly playbooksRepository: PlaybooksRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: ArchivePlaybookCommand): Promise<PlaybookDto> {
    const { workspaceId, playbook } = await resolvePlaybookForCaller(
      this.workspacesRepository,
      this.playbooksRepository,
      command.userId,
      command.playbookId,
    );
    const updated = await this.playbooksRepository.update(playbook.id, {
      status: 'ARCHIVED',
      archivedAt: new Date(),
    });
    this.eventBus.publish(new PlaybookArchivedEvent(workspaceId, command.userId, playbook.id, {}));
    return toPlaybookDto(updated);
  }
}
