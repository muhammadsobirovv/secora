import { HttpStatus, Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { PlaybookDto, PlaybookVersionDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  PLAYBOOKS_REPOSITORY,
  type PlaybooksRepository,
} from '../domain/repositories/playbooks.repository.interface.js';
import { toPlaybookDto, toPlaybookVersionDto } from '../mappers/to-playbook-dto.mapper.js';
import { PlaybookSeedService } from '../seed/playbook-seed.service.js';

async function resolveWorkspace(workspacesRepository: WorkspacesRepository, userId: string): Promise<string> {
  const workspace = await workspacesRepository.findPersonalWorkspaceForUser(userId);
  if (!workspace) {
    throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
  }
  return workspace.id;
}

export class ListPlaybooksQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly filter: { status?: string; category?: string } = {},
  ) {}
}

@QueryHandler(ListPlaybooksQuery)
export class ListPlaybooksHandler implements IQueryHandler<ListPlaybooksQuery, PlaybookDto[]> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PLAYBOOKS_REPOSITORY) private readonly playbooksRepository: PlaybooksRepository,
    private readonly seedService: PlaybookSeedService,
  ) {}

  async execute(query: ListPlaybooksQuery): Promise<PlaybookDto[]> {
    const workspaceId = await resolveWorkspace(this.workspacesRepository, query.userId);
    await this.seedService.ensureForWorkspace(workspaceId, query.userId);
    const playbooks = await this.playbooksRepository.list({ workspaceId, ...query.filter });
    return playbooks.map(toPlaybookDto);
  }
}

export class GetPlaybookQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly playbookId: string,
  ) {}
}

@QueryHandler(GetPlaybookQuery)
export class GetPlaybookHandler implements IQueryHandler<GetPlaybookQuery, { playbook: PlaybookDto; version: PlaybookVersionDto | null }> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PLAYBOOKS_REPOSITORY) private readonly playbooksRepository: PlaybooksRepository,
  ) {}

  async execute(query: GetPlaybookQuery): Promise<{ playbook: PlaybookDto; version: PlaybookVersionDto | null }> {
    const workspaceId = await resolveWorkspace(this.workspacesRepository, query.userId);
    const playbook = await this.playbooksRepository.findByIdForWorkspace(query.playbookId, workspaceId);
    if (!playbook) {
      throw new AppException('PLAYBOOK_NOT_FOUND', 'Playbook not found.', HttpStatus.NOT_FOUND);
    }
    const version = playbook.currentVersionId
      ? await this.playbooksRepository.findVersionById(playbook.currentVersionId)
      : await this.playbooksRepository.findLatestVersion(playbook.id);
    return { playbook: toPlaybookDto(playbook), version: version ? toPlaybookVersionDto(version) : null };
  }
}
