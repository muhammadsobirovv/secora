import { describe, expect, it, jest } from '@jest/globals';
import { EventBus } from '@nestjs/cqrs';
import { createHash } from 'node:crypto';
import { compileTransactionalTestingModule } from '../../../test-utils/transactional-testing-module.js';
import {
  UploadAttachmentHandler,
  UploadAttachmentCommand,
} from './upload-attachment.command.js';
import { WORKSPACES_REPOSITORY } from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { PROJECTS_REPOSITORY } from '../../projects/domain/repositories/projects.repository.interface.js';
import { TARGETS_REPOSITORY } from '../../targets/domain/repositories/targets.repository.interface.js';
import { NOTES_REPOSITORY } from '../../notes/domain/repositories/notes.repository.interface.js';
import { EVIDENCE_REPOSITORY } from '../../evidence/domain/repositories/evidence.repository.interface.js';
import { ATTACHMENTS_REPOSITORY } from '../domain/repositories/attachments.repository.interface.js';
import { STORAGE_SERVICE } from '../../../common/providers/tokens.js';
import type { Attachment, Evidence, Workspace } from '../../../prisma-types.js';

describe('UploadAttachmentHandler', () => {
  const fileBuffer = Buffer.from('hello world');
  const expectedChecksum = createHash('sha256')
    .update(fileBuffer)
    .digest('hex');

  async function buildHandler() {
    const workspace = { id: 'ws-1' } as Workspace;
    const evidence = { id: 'ev-1', projectId: 'proj-1' } as Evidence;
    const attachment = {
      id: 'att-1',
      workspaceId: 'ws-1',
      attachableType: 'EVIDENCE',
      attachableId: 'ev-1',
      storageKey: 'k',
      createdAt: new Date(),
    } as Attachment;

    const workspacesRepository = {
      findPersonalWorkspaceForUser: jest.fn<any>().mockResolvedValue(workspace),
    };
    const projectsRepository = {
      findByIdForWorkspace: jest
        .fn<any>()
        .mockResolvedValue({ id: 'proj-1', workspaceId: 'ws-1' }),
    };
    const targetsRepository = { findById: jest.fn<any>() };
    const notesRepository = { findById: jest.fn<any>() };
    const evidenceRepository = {
      findById: jest.fn<any>().mockResolvedValue(evidence),
      update: jest.fn<any>().mockResolvedValue(evidence),
    };
    const attachmentsRepository = {
      create: jest.fn<any>().mockResolvedValue(attachment),
    };
    const storageService = {
      upload: jest.fn<any>().mockResolvedValue({ key: 'k', url: 'file:///k' }),
      getUrl: jest.fn<any>(),
      delete: jest.fn<any>(),
    };
    const eventBus = { publish: jest.fn() };

    const moduleRef = await compileTransactionalTestingModule([
      UploadAttachmentHandler,
      { provide: WORKSPACES_REPOSITORY, useValue: workspacesRepository },
      { provide: PROJECTS_REPOSITORY, useValue: projectsRepository },
      { provide: TARGETS_REPOSITORY, useValue: targetsRepository },
      { provide: NOTES_REPOSITORY, useValue: notesRepository },
      { provide: EVIDENCE_REPOSITORY, useValue: evidenceRepository },
      { provide: ATTACHMENTS_REPOSITORY, useValue: attachmentsRepository },
      { provide: STORAGE_SERVICE, useValue: storageService },
      { provide: EventBus, useValue: eventBus },
    ]);

    return {
      handler: moduleRef.get(UploadAttachmentHandler),
      evidenceRepository,
      attachmentsRepository,
      eventBus,
    };
  }

  it('computes and persists a SHA-256 checksum on the parent Evidence row', async () => {
    const { handler, evidenceRepository } = await buildHandler();

    await handler.execute(
      new UploadAttachmentCommand(
        'user-1',
        'EVIDENCE',
        'ev-1',
        'scan.txt',
        'text/plain',
        fileBuffer,
      ),
    );

    expect(evidenceRepository.update).toHaveBeenCalledWith('ev-1', {
      checksum: expectedChecksum,
    });
  });

  it('creates the attachment row and publishes attachment.uploaded', async () => {
    const { handler, attachmentsRepository, eventBus } = await buildHandler();

    const result = await handler.execute(
      new UploadAttachmentCommand(
        'user-1',
        'EVIDENCE',
        'ev-1',
        'scan.txt',
        'text/plain',
        fileBuffer,
      ),
    );

    expect(attachmentsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        attachableType: 'EVIDENCE',
        attachableId: 'ev-1',
        workspaceId: 'ws-1',
      }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ verb: 'attachment.uploaded' }),
    );
    expect(result.id).toBe('att-1');
  });
});
