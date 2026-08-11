import { describe, expect, it, jest } from '@jest/globals';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import {
  GetAvailablePluginUpdatesHandler,
  GetAvailablePluginUpdatesQuery,
} from './plugin-installations.query.js';

/// Module 14 — Auto Update. First spec for this query — also exercises
/// `resolveOrganizationMembership` indirectly (by stubbing the
/// `organizationMember.findUnique` call it makes) rather than mocking
/// the util function itself, since no existing spec in this codebase
/// mocks that util at the module level (see docs/architecture/ci-cd.md's
/// disclosed test-coverage gaps for why this is the first one).
function buildPrisma(overrides: {
  installations?: unknown[];
  versions?: unknown[];
  activeMember?: boolean;
}): PrismaService {
  const activeMember = overrides.activeMember ?? true;
  return {
    organizationMember: {
      findUnique: jest.fn(async () =>
        activeMember ? { id: 'member-1', role: 'ADMIN', departmentId: null, status: 'ACTIVE' } : null,
      ),
    },
    pluginInstallation: {
      findMany: jest.fn(async () => overrides.installations ?? []),
    },
    pluginVersion: {
      findMany: jest.fn(async () => overrides.versions ?? []),
    },
  } as unknown as PrismaService;
}

const PUBLISHED_OLD = new Date('2025-01-01T00:00:00Z');
const PUBLISHED_NEW = new Date('2025-06-01T00:00:00Z');

describe('GetAvailablePluginUpdatesHandler', () => {
  it('returns [] without querying PluginVersion when the org has no installed plugins', async () => {
    const prisma = buildPrisma({ installations: [] });
    const handler = new GetAvailablePluginUpdatesHandler(prisma);
    const result = await handler.execute(new GetAvailablePluginUpdatesQuery('user-1', 'org-1'));
    expect(result).toEqual([]);
    expect(prisma.pluginVersion.findMany).not.toHaveBeenCalled();
  });

  it('reports an installation as having an update when a newer non-deprecated version exists', async () => {
    const prisma = buildPrisma({
      installations: [
        {
          id: 'install-1',
          pluginId: 'p1',
          workspaceId: null,
          versionId: 'v1-old',
          plugin: { name: 'Nmap Wrapper' },
          version: { id: 'v1-old', version: '1.0.0' },
        },
      ],
      versions: [
        // orderBy publishedAt desc — newest first, as the real query returns it
        { id: 'v1-new', pluginId: 'p1', version: '1.2.0', publishedAt: PUBLISHED_NEW, changelog: 'Fixes a crash', deprecated: false },
        { id: 'v1-old', pluginId: 'p1', version: '1.0.0', publishedAt: PUBLISHED_OLD, changelog: null, deprecated: false },
      ],
    });
    const handler = new GetAvailablePluginUpdatesHandler(prisma);
    const result = await handler.execute(new GetAvailablePluginUpdatesQuery('user-1', 'org-1'));
    expect(result).toEqual([
      {
        installationId: 'install-1',
        pluginId: 'p1',
        pluginName: 'Nmap Wrapper',
        workspaceId: null,
        installedVersionId: 'v1-old',
        installedVersion: '1.0.0',
        latestVersionId: 'v1-new',
        latestVersion: '1.2.0',
        latestChangelog: 'Fixes a crash',
      },
    ]);
  });

  it('excludes an installation that is already on the latest version', async () => {
    const prisma = buildPrisma({
      installations: [
        {
          id: 'install-2',
          pluginId: 'p2',
          workspaceId: 'ws-1',
          versionId: 'v2-latest',
          plugin: { name: 'Recon Helper' },
          version: { id: 'v2-latest', version: '2.0.0' },
        },
      ],
      versions: [
        { id: 'v2-latest', pluginId: 'p2', version: '2.0.0', publishedAt: PUBLISHED_NEW, changelog: null, deprecated: false },
      ],
    });
    const handler = new GetAvailablePluginUpdatesHandler(prisma);
    const result = await handler.execute(new GetAvailablePluginUpdatesQuery('user-1', 'org-1'));
    expect(result).toEqual([]);
  });

  it('excludes an installation whose plugin has no non-deprecated version at all', async () => {
    const prisma = buildPrisma({
      installations: [
        {
          id: 'install-3',
          pluginId: 'p3',
          workspaceId: null,
          versionId: 'v3-only',
          plugin: { name: 'Deprecated Plugin' },
          version: { id: 'v3-only', version: '0.9.0' },
        },
      ],
      versions: [], // the query already filters deprecated:false, so an all-deprecated plugin yields no rows
    });
    const handler = new GetAvailablePluginUpdatesHandler(prisma);
    const result = await handler.execute(new GetAvailablePluginUpdatesQuery('user-1', 'org-1'));
    expect(result).toEqual([]);
  });

  it('throws ORGANIZATION_MEMBERSHIP_NOT_FOUND for a non-member rather than leaking installation data', async () => {
    const prisma = buildPrisma({ activeMember: false });
    const handler = new GetAvailablePluginUpdatesHandler(prisma);
    await expect(
      handler.execute(new GetAvailablePluginUpdatesQuery('outsider', 'org-1')),
    ).rejects.toMatchObject({ code: 'ORGANIZATION_MEMBERSHIP_NOT_FOUND' });
    expect(prisma.pluginInstallation.findMany).not.toHaveBeenCalled();
  });
});
