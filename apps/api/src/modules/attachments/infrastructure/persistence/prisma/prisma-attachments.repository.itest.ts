import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { createRealPrismaService } from '../../../../../test-utils/real-prisma-service.js';
import { createRealTransactionHost } from '../../../../../test-utils/real-prisma-transaction-host.js';
import { PrismaAttachmentsRepository } from './prisma-attachments.repository.js';
import type { PrismaService } from '../../../../../prisma/prisma.service.js';

describe('PrismaAttachmentsRepository (integration)', () => {
  let prisma: PrismaService;
  let repository: PrismaAttachmentsRepository;
  let workspaceId: string;
  let userId: string;
  const email = `itest-attachments-${Date.now()}@example.com`;

  beforeAll(async () => {
    prisma = createRealPrismaService();
    repository = new PrismaAttachmentsRepository(
      createRealTransactionHost(prisma),
    );

    const user = await prisma.user.create({
      data: { email, displayName: 'Attachments Fixture', emailVerified: true },
    });
    userId = user.id;
    const workspace = await prisma.workspace.create({
      data: {
        name: 'Attachments Fixture WS',
        slug: `attachments-fixture-ws-${Date.now()}`,
      },
    });
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    // Attachment.uploadedBy -> User has no onDelete: Cascade (Attachment
    // is the one polymorphic table with no cascading parent to rely on).
    await prisma.attachment.deleteMany({ where: { uploadedBy: userId } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it('creates an attachment against a polymorphic parent with no DB-level FK enforcement', async () => {
    // attachableId deliberately doesn't correspond to a real row — the
    // repository layer has no FK here by design (docs/adr/0002, Decision 3);
    // existence is validated by the command handler before this is called.
    const created = await repository.create({
      workspaceId,
      attachableType: 'PROJECT',
      attachableId: 'not-a-real-project-id',
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      storageKey: 'k1',
      uploadedBy: userId,
    });

    const found = await repository.findById(created.id);
    expect(found?.fileName).toBe('report.pdf');
  });

  it('list() scopes strictly by attachableType + attachableId (a NOTE and an EVIDENCE with the same id string do not collide)', async () => {
    const sharedId = `shared-${Date.now()}`;
    await repository.create({
      workspaceId,
      attachableType: 'NOTE',
      attachableId: sharedId,
      fileName: 'note-attachment.png',
      mimeType: 'image/png',
      sizeBytes: 500,
      storageKey: 'k2',
      uploadedBy: userId,
    });
    await repository.create({
      workspaceId,
      attachableType: 'EVIDENCE',
      attachableId: sharedId,
      fileName: 'evidence-attachment.png',
      mimeType: 'image/png',
      sizeBytes: 600,
      storageKey: 'k3',
      uploadedBy: userId,
    });

    const noteAttachments = await repository.list('NOTE', sharedId);
    const evidenceAttachments = await repository.list('EVIDENCE', sharedId);

    expect(noteAttachments).toHaveLength(1);
    expect(noteAttachments[0]?.fileName).toBe('note-attachment.png');
    expect(evidenceAttachments).toHaveLength(1);
    expect(evidenceAttachments[0]?.fileName).toBe('evidence-attachment.png');
  });

  it('softDelete() removes the row from list() results', async () => {
    const attachableId = `deletable-${Date.now()}`;
    const created = await repository.create({
      workspaceId,
      attachableType: 'TARGET',
      attachableId,
      fileName: 'screenshot.png',
      mimeType: 'image/png',
      sizeBytes: 700,
      storageKey: 'k4',
      uploadedBy: userId,
    });

    await repository.softDelete(created.id);

    const listed = await repository.list('TARGET', attachableId);
    expect(listed).toHaveLength(0);
    expect(await repository.findById(created.id)).toBeNull();
  });
});
