import { describe, expect, it, jest } from '@jest/globals';
import { EventBus } from '@nestjs/cqrs';
import {
  CreateEvidenceHandler,
  CreateEvidenceCommand,
} from './create-evidence.command.js';
import type { WorkspacesRepository } from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import type {
  ProjectsRepository,
  ProjectWithTags,
} from '../../projects/domain/repositories/projects.repository.interface.js';
import type { EvidenceRepository } from '../domain/repositories/evidence.repository.interface.js';
import type { Evidence, Workspace } from '../../../prisma-types.js';

describe('CreateEvidenceHandler', () => {
  it('creates evidence scoped to the project and publishes evidence.uploaded', async () => {
    const workspace = { id: 'ws-1' } as Workspace;
    const project = {
      id: 'proj-1',
      workspaceId: 'ws-1',
      tags: [],
    } as unknown as ProjectWithTags;
    const evidence = {
      id: 'ev-1',
      projectId: 'proj-1',
      type: 'LOG',
      title: 'Scan',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Evidence;

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
    const evidenceRepository = {
      create: jest
        .fn<EvidenceRepository['create']>()
        .mockResolvedValue(evidence),
    } as unknown as jest.Mocked<EvidenceRepository>;
    const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;

    const handler = new CreateEvidenceHandler(
      workspacesRepository,
      projectsRepository,
      evidenceRepository,
      eventBus,
    );

    const result = await handler.execute(
      new CreateEvidenceCommand('user-1', 'proj-1', {
        type: 'LOG',
        title: 'Scan',
      }),
    );

    expect(result.id).toBe('ev-1');
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: 'evidence.uploaded',
        entityType: 'Evidence',
      }),
    );
  });
});
