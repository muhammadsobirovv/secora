import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { createRealPrismaService } from '../../../../../test-utils/real-prisma-service.js';
import { createRealTransactionHost } from '../../../../../test-utils/real-prisma-transaction-host.js';
import { PrismaProjectsRepository } from './prisma-projects.repository.js';
import type { PrismaService } from '../../../../../prisma/prisma.service.js';

describe('PrismaProjectsRepository (integration)', () => {
  let prisma: PrismaService;
  let repository: PrismaProjectsRepository;
  let workspaceId: string;
  let userId: string;
  const email = `itest-projects-${Date.now()}@example.com`;

  beforeAll(async () => {
    prisma = createRealPrismaService();
    repository = new PrismaProjectsRepository(
      createRealTransactionHost(prisma),
    );

    const user = await prisma.user.create({
      data: { email, displayName: 'Projects Fixture', emailVerified: true },
    });
    userId = user.id;
    const workspace = await prisma.workspace.create({
      data: { name: 'Fixture WS', slug: `fixture-ws-${Date.now()}` },
    });
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it('creates a project and finds it with an empty tags array', async () => {
    const created = await repository.create({
      workspaceId,
      name: 'Fixture Project',
      createdBy: userId,
    });

    const found = await repository.findById(created.id);
    expect(found?.name).toBe('Fixture Project');
    expect(found?.tags).toEqual([]);
  });

  it('list() excludes soft-deleted projects but findByIdIncludingDeleted still finds them', async () => {
    const project = await repository.create({
      workspaceId,
      name: 'To Be Deleted',
      createdBy: userId,
    });
    await repository.softDelete(project.id);

    const listed = await repository.list({ workspaceId });
    expect(listed.find((p) => p.id === project.id)).toBeUndefined();

    const stillFound = await repository.findByIdIncludingDeleted(project.id);
    expect(stillFound?.id).toBe(project.id);
    expect(stillFound?.deletedAt).not.toBeNull();
  });

  it('restore() clears deletedAt without touching status', async () => {
    const project = await repository.create({
      workspaceId,
      name: 'Archive Then Restore',
      createdBy: userId,
    });
    await repository.archive(project.id);
    await repository.softDelete(project.id);

    const restored = await repository.restore(project.id);
    expect(restored.deletedAt).toBeNull();
    expect(restored.status).toBe('ARCHIVED');
  });

  it('findByIdForWorkspace returns null for a project in a different workspace (enumeration-safe)', async () => {
    const project = await repository.create({
      workspaceId,
      name: 'Scoped Project',
      createdBy: userId,
    });

    const wrongWorkspace = await repository.findByIdForWorkspace(
      project.id,
      'not-a-real-workspace-id',
    );
    expect(wrongWorkspace).toBeNull();

    const rightWorkspace = await repository.findByIdForWorkspace(
      project.id,
      workspaceId,
    );
    expect(rightWorkspace?.id).toBe(project.id);
  });

  it('list() filters by status', async () => {
    await repository.create({
      workspaceId,
      name: 'On Hold Project',
      status: 'ON_HOLD',
      createdBy: userId,
    });

    const onHold = await repository.list({ workspaceId, status: 'ON_HOLD' });
    expect(onHold.every((p) => p.status === 'ON_HOLD')).toBe(true);
    expect(onHold.length).toBeGreaterThan(0);
  });
});
