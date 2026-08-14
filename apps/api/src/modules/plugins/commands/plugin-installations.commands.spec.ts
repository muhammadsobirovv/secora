import { describe, expect, it, jest } from '@jest/globals';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import type { EventBus } from '@nestjs/cqrs';
import type { PluginPermissionEnforcerService } from '../plugin-permission-enforcer.service.js';
import { hashPluginBundle } from '../plugin-signature.util.js';
import { InstallPluginCommand, InstallPluginHandler } from './plugin-installations.commands.js';

/// Module 15 — supply-chain security extensions (task #345). First spec
/// for `InstallPluginHandler` — scoped to the newly-added install-time
/// integrity re-check (checksum recomputed from the stored `sourceCode`
/// and compared against `PluginVersion.checksumSha256`), plus enough of
/// the surrounding happy path to prove the check doesn't false-positive
/// on a legitimately unmodified version. Not a full behavioral spec of
/// every existing branch (permission consent, dependency resolution) —
/// see this handler's own doc comments for that logic; this file only
/// covers what task #345 changed.
function buildPrisma(overrides: {
  version?: Record<string, unknown> | null;
  existingInstallation?: Record<string, unknown> | null;
}): PrismaService {
  const sourceCode = 'console.log("hello")';
  const checksumSha256 = hashPluginBundle(Buffer.from(sourceCode, 'utf8').toString('base64'));
  const defaultVersion = {
    id: 'version-1',
    pluginId: 'plugin-1',
    permissions: ['network:fetch'],
    dependencies: null,
    deprecated: false,
    sourceCode,
    checksumSha256,
    version: '1.0.0',
  };

  return {
    organizationMember: {
      findUnique: jest.fn(async () => ({ id: 'member-1', role: 'ADMIN', departmentId: null, status: 'ACTIVE' })),
    },
    pluginVersion: {
      findFirst: jest.fn(async () => (overrides.version === undefined ? defaultVersion : overrides.version)),
    },
    pluginInstallation: {
      findFirst: jest.fn(async () => overrides.existingInstallation ?? null),
      findMany: jest.fn(async () => []),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'install-1',
        ...args.data,
      })),
      update: jest.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'install-1',
        ...args.data,
      })),
    },
    plugin: {
      update: jest.fn(async () => ({})),
    },
    auditEvent: {
      create: jest.fn(async () => ({})),
    },
  } as unknown as PrismaService;
}

function buildDeps(overrides: Parameters<typeof buildPrisma>[0] = {}) {
  const prisma = buildPrisma(overrides);
  const eventBus = { publish: jest.fn() } as unknown as EventBus;
  const permissionEnforcer = {
    grant: jest.fn(async () => ({ installationId: 'install-1', granted: [], declared: [] })),
  } as unknown as PluginPermissionEnforcerService;
  const handler = new InstallPluginHandler(prisma, eventBus, permissionEnforcer);
  return { prisma, eventBus, permissionEnforcer, handler };
}

const baseInput = {
  pluginId: 'plugin-1',
  versionId: 'version-1',
  workspaceId: 'workspace-1',
  acceptedPermissions: ['network:fetch'],
  config: null,
};

describe('InstallPluginHandler — install-time integrity check (task #345)', () => {
  it('installs successfully when the recomputed checksum matches the recorded one', async () => {
    const deps = buildDeps();

    const result = await deps.handler.execute(new InstallPluginCommand('user-1', 'org-1', baseInput));

    expect(result).toBeDefined();
    expect(deps.prisma.pluginInstallation.create).toHaveBeenCalled();
    expect(deps.permissionEnforcer.grant).toHaveBeenCalledWith('install-1', ['network:fetch'], 'user-1');
  });

  it('rejects installation when the stored source no longer matches its recorded checksum', async () => {
    const deps = buildDeps({
      version: {
        id: 'version-1',
        pluginId: 'plugin-1',
        permissions: ['network:fetch'],
        dependencies: null,
        deprecated: false,
        sourceCode: 'console.log("tampered")',
        checksumSha256: 'not-the-real-checksum',
        version: '1.0.0',
      },
    });

    await expect(
      deps.handler.execute(new InstallPluginCommand('user-1', 'org-1', baseInput)),
    ).rejects.toMatchObject({ code: 'PLUGIN_INTEGRITY_CHECK_FAILED' });
    expect(deps.prisma.pluginInstallation.create).not.toHaveBeenCalled();
  });

  it('skips the integrity check for a legacy version with no recorded checksum', async () => {
    const deps = buildDeps({
      version: {
        id: 'version-1',
        pluginId: 'plugin-1',
        permissions: ['network:fetch'],
        dependencies: null,
        deprecated: false,
        sourceCode: 'console.log("legacy, published before task #333")',
        checksumSha256: null,
        version: '1.0.0',
      },
    });

    const result = await deps.handler.execute(new InstallPluginCommand('user-1', 'org-1', baseInput));

    expect(result).toBeDefined();
    expect(deps.prisma.pluginInstallation.create).toHaveBeenCalled();
  });

  it('rejects a deprecated version before ever reaching the integrity check', async () => {
    const deps = buildDeps({
      version: {
        id: 'version-1',
        pluginId: 'plugin-1',
        permissions: ['network:fetch'],
        dependencies: null,
        deprecated: true,
        sourceCode: 'console.log("old")',
        checksumSha256: 'irrelevant',
        version: '0.9.0',
      },
    });

    await expect(
      deps.handler.execute(new InstallPluginCommand('user-1', 'org-1', baseInput)),
    ).rejects.toMatchObject({ code: 'PLUGIN_VERSION_DEPRECATED' });
  });
});
