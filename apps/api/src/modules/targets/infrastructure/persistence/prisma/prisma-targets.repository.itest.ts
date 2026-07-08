import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { createRealPrismaService } from '../../../../../test-utils/real-prisma-service.js';
import { createRealTransactionHost } from '../../../../../test-utils/real-prisma-transaction-host.js';
import { PrismaTargetsRepository } from './prisma-targets.repository.js';
import type { PrismaService } from '../../../../../prisma/prisma.service.js';

describe('PrismaTargetsRepository (integration)', () => {
  let prisma: PrismaService;
  let repository: PrismaTargetsRepository;
  let projectId: string;
  let userId: string;
  const email = `itest-targets-${Date.now()}@example.com`;

  beforeAll(async () => {
    prisma = createRealPrismaService();
    repository = new PrismaTargetsRepository(createRealTransactionHost(prisma));

    const user = await prisma.user.create({
      data: { email, displayName: 'Targets Fixture', emailVerified: true },
    });
    userId = user.id;
    const workspace = await prisma.workspace.create({
      data: {
        name: 'Targets Fixture WS',
        slug: `targets-fixture-ws-${Date.now()}`,
      },
    });
    const project = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: 'Targets Fixture Project',
        createdBy: userId,
      },
    });
    projectId = project.id;
  });

  afterAll(async () => {
    // Project.createdBy -> User has no onDelete: Cascade, so the project
    // (and its Targets, cascaded from Project) must go first.
    await prisma.project.deleteMany({ where: { createdBy: userId } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it('creates a target with defaults and finds it with an empty tags array', async () => {
    const created = await repository.create({
      projectId,
      type: 'DOMAIN',
      value: 'example.com',
      createdBy: userId,
    });

    const found = await repository.findById(created.id);
    expect(found?.value).toBe('example.com');
    expect(found?.environment).toBe('UNKNOWN');
    expect(found?.scopeStatus).toBe('PENDING_REVIEW');
    expect(found?.tags).toEqual([]);
  });

  it('list() filters by type and excludes soft-deleted targets', async () => {
    await repository.create({
      projectId,
      type: 'IP_ADDRESS',
      value: '10.0.0.1',
      createdBy: userId,
    });
    const deletable = await repository.create({
      projectId,
      type: 'IP_ADDRESS',
      value: '10.0.0.2',
      createdBy: userId,
    });
    await repository.softDelete(deletable.id);

    const ipTargets = await repository.list({ projectId, type: 'IP_ADDRESS' });
    expect(ipTargets.every((t) => t.type === 'IP_ADDRESS')).toBe(true);
    expect(ipTargets.find((t) => t.id === deletable.id)).toBeUndefined();
  });

  it('findByIdForProject returns null for a target in a different project', async () => {
    const target = await repository.create({
      projectId,
      type: 'URL',
      value: 'https://example.com/app',
      createdBy: userId,
    });

    const wrongProject = await repository.findByIdForProject(
      target.id,
      'not-a-real-project-id',
    );
    expect(wrongProject).toBeNull();

    const rightProject = await repository.findByIdForProject(
      target.id,
      projectId,
    );
    expect(rightProject?.id).toBe(target.id);
  });

  it('update() changes scopeStatus and environment', async () => {
    const target = await repository.create({
      projectId,
      type: 'SUBDOMAIN',
      value: 'api.example.com',
      createdBy: userId,
    });

    await repository.update(target.id, {
      scopeStatus: 'IN_SCOPE',
      environment: 'PRODUCTION',
    });

    const updated = await repository.findById(target.id);
    expect(updated?.scopeStatus).toBe('IN_SCOPE');
    expect(updated?.environment).toBe('PRODUCTION');
  });
});
