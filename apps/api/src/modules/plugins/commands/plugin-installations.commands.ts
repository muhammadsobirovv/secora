import { CommandHandler, EventBus, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import type {
  ExecutePluginHookRequestDto,
  ExecutePluginHookResultDto,
  InstallPluginRequestDto,
  PluginDependencyDto,
  PluginInstallationDto,
  PluginManifest,
  UpdatePluginInstallationRequestDto,
} from '@pentesthub/shared';
import type { AuditEventType, Prisma } from '../../../prisma-types.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveOrganizationMembership } from '../../enterprise/organization-membership.util.js';
import { requireEnterpriseRole } from '../../enterprise/enterprise-permissions.util.js';
import { resolveDependencies } from '../dependency-resolution.util.js';
import { PluginSandboxService } from '../plugin-sandbox.service.js';
import { validateHookDeclared } from '../plugin-sandbox.service.js';
import { toPluginInstallationDto } from '../mappers/to-plugin-dto.mapper.js';
import { PluginInstalledEvent, PluginUninstalledEvent } from '../events/plugin-events.js';

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

export class InstallPluginCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly data: InstallPluginRequestDto,
  ) {}
}

@CommandHandler(InstallPluginCommand)
export class InstallPluginHandler implements ICommandHandler<InstallPluginCommand, PluginInstallationDto> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: InstallPluginCommand): Promise<PluginInstallationDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ADMIN');

    const version = await this.prisma.pluginVersion.findFirst({
      where: { id: command.data.versionId, pluginId: command.data.pluginId },
    });
    if (!version) {
      throw new AppException('PLUGIN_VERSION_NOT_FOUND', 'Plugin version not found.', HttpStatus.NOT_FOUND);
    }
    if (version.deprecated) {
      throw new AppException('PLUGIN_VERSION_DEPRECATED', 'This plugin version is deprecated.', HttpStatus.CONFLICT);
    }

    // Explicit-consent check — the accepted set must exactly match the
    // version's declared permissions ("Permissions" spec line item), not
    // merely be a superset/subset, so a stale client can't silently
    // under- or over-grant.
    const declared = new Set(version.permissions);
    const accepted = new Set(command.data.acceptedPermissions);
    const permissionsMatch =
      declared.size === accepted.size && [...declared].every((p) => accepted.has(p));
    if (!permissionsMatch) {
      throw new AppException(
        'PLUGIN_PERMISSIONS_NOT_ACCEPTED',
        'Accepted permissions must exactly match the version\'s declared permissions.',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Dependency resolution — every declared dependency must already be
    // installed, in a satisfying version range, in the same scope.
    const dependencies = (version.dependencies as unknown as PluginDependencyDto[] | null) ?? [];
    if (dependencies.length > 0) {
      const existingInstalls = await this.prisma.pluginInstallation.findMany({
        where: { organizationId: command.organizationId, workspaceId: command.data.workspaceId },
        include: { plugin: true, version: true },
      });
      const installedBySlug = Object.fromEntries(
        existingInstalls.map((i) => [i.plugin.slug, i.version.version]),
      );
      const results = resolveDependencies(dependencies, installedBySlug);
      const unresolved = results.filter((r) => !r.satisfied);
      if (unresolved.length > 0) {
        throw new AppException(
          'PLUGIN_DEPENDENCY_UNRESOLVED',
          `Unresolved dependencies: ${unresolved.map((u) => `${u.slug}@${u.versionRange}`).join(', ')}`,
          HttpStatus.CONFLICT,
        );
      }
    }

    // Manual find-then-create/update rather than `.upsert()` on the
    // compound `[organizationId, workspaceId, pluginId]` unique index:
    // Postgres treats `NULL <> NULL` in unique constraints, so an
    // org-wide install (`workspaceId: null`) can't rely on that index to
    // dedupe via `.upsert()` — a plain `findFirst` handles both the
    // per-workspace and org-wide cases correctly.
    const existingInstallation = await this.prisma.pluginInstallation.findFirst({
      where: {
        organizationId: command.organizationId,
        workspaceId: command.data.workspaceId ?? null,
        pluginId: command.data.pluginId,
      },
    });
    const installation = existingInstallation
      ? await this.prisma.pluginInstallation.update({
          where: { id: existingInstallation.id },
          data: {
            versionId: version.id,
            enabled: true,
            config: (command.data.config ?? null) as unknown as Prisma.InputJsonValue,
          },
        })
      : await this.prisma.pluginInstallation.create({
          data: {
            organizationId: command.organizationId,
            workspaceId: command.data.workspaceId,
            pluginId: command.data.pluginId,
            versionId: version.id,
            installedBy: command.userId,
            config: (command.data.config ?? null) as unknown as Prisma.InputJsonValue,
          },
        });

    await this.prisma.plugin.update({
      where: { id: command.data.pluginId },
      data: { downloadCount: { increment: 1 } },
    });

    const type: AuditEventType = 'PLUGIN_INSTALLED';
    await this.prisma.auditEvent.create({
      data: {
        userId: command.userId,
        type,
        ipAddress: '0.0.0.0',
        userAgent: 'api',
        metadata: { organizationId: command.organizationId, pluginId: command.data.pluginId, versionId: version.id },
      },
    });

    if (command.data.workspaceId) {
      this.eventBus.publish(
        new PluginInstalledEvent(command.data.workspaceId, command.userId, installation.id, {
          pluginId: command.data.pluginId,
          version: version.version,
        }),
      );
    }

    return toPluginInstallationDto(installation);
  }
}

// ---------------------------------------------------------------------------
// Update (upgrade version / toggle enabled / update config)
// ---------------------------------------------------------------------------

export class UpdatePluginInstallationCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly installationId: string,
    public readonly data: UpdatePluginInstallationRequestDto,
  ) {}
}

@CommandHandler(UpdatePluginInstallationCommand)
export class UpdatePluginInstallationHandler
  implements ICommandHandler<UpdatePluginInstallationCommand, PluginInstallationDto>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdatePluginInstallationCommand): Promise<PluginInstallationDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ADMIN');

    const existing = await this.prisma.pluginInstallation.findFirst({
      where: { id: command.installationId, organizationId: command.organizationId },
    });
    if (!existing) {
      throw new AppException('PLUGIN_INSTALLATION_NOT_FOUND', 'Plugin installation not found.', HttpStatus.NOT_FOUND);
    }

    let versionId = existing.versionId;
    if (command.data.versionId) {
      const newVersion = await this.prisma.pluginVersion.findFirst({
        where: { id: command.data.versionId, pluginId: existing.pluginId },
      });
      if (!newVersion) {
        throw new AppException('PLUGIN_VERSION_NOT_FOUND', 'Plugin version not found.', HttpStatus.NOT_FOUND);
      }
      if (command.data.acceptedPermissions) {
        const declared = new Set(newVersion.permissions);
        const accepted = new Set(command.data.acceptedPermissions);
        const match = declared.size === accepted.size && [...declared].every((p) => accepted.has(p));
        if (!match) {
          throw new AppException(
            'PLUGIN_PERMISSIONS_NOT_ACCEPTED',
            'Accepted permissions must exactly match the new version\'s declared permissions.',
            HttpStatus.BAD_REQUEST,
          );
        }
      }
      versionId = newVersion.id;
    }

    const updated = await this.prisma.pluginInstallation.update({
      where: { id: existing.id },
      data: {
        versionId,
        enabled: command.data.enabled,
        config: command.data.config as unknown as Prisma.InputJsonValue,
      },
    });
    return toPluginInstallationDto(updated);
  }
}

// ---------------------------------------------------------------------------
// Uninstall
// ---------------------------------------------------------------------------

export class UninstallPluginCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly installationId: string,
  ) {}
}

@CommandHandler(UninstallPluginCommand)
export class UninstallPluginHandler implements ICommandHandler<UninstallPluginCommand, void> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: UninstallPluginCommand): Promise<void> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ADMIN');

    const existing = await this.prisma.pluginInstallation.findFirst({
      where: { id: command.installationId, organizationId: command.organizationId },
    });
    if (!existing) {
      throw new AppException('PLUGIN_INSTALLATION_NOT_FOUND', 'Plugin installation not found.', HttpStatus.NOT_FOUND);
    }
    await this.prisma.pluginInstallation.delete({ where: { id: existing.id } });

    const type: AuditEventType = 'PLUGIN_REMOVED';
    await this.prisma.auditEvent.create({
      data: {
        userId: command.userId,
        type,
        ipAddress: '0.0.0.0',
        userAgent: 'api',
        metadata: { organizationId: command.organizationId, pluginId: existing.pluginId },
      },
    });

    if (existing.workspaceId) {
      this.eventBus.publish(
        new PluginUninstalledEvent(existing.workspaceId, command.userId, existing.id, { pluginId: existing.pluginId }),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Execute — sandboxed hook invocation
// ---------------------------------------------------------------------------

export class ExecutePluginHookCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly installationId: string,
    public readonly data: ExecutePluginHookRequestDto,
  ) {}
}

@CommandHandler(ExecutePluginHookCommand)
export class ExecutePluginHookHandler
  implements ICommandHandler<ExecutePluginHookCommand, ExecutePluginHookResultDto>
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly sandbox: PluginSandboxService,
  ) {}

  async execute(command: ExecutePluginHookCommand): Promise<ExecutePluginHookResultDto> {
    await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);

    const installation = await this.prisma.pluginInstallation.findFirst({
      where: { id: command.installationId, organizationId: command.organizationId },
      include: { version: true },
    });
    if (!installation) {
      throw new AppException('PLUGIN_INSTALLATION_NOT_FOUND', 'Plugin installation not found.', HttpStatus.NOT_FOUND);
    }
    if (!installation.enabled) {
      throw new AppException('PLUGIN_EXECUTION_FAILED', 'This plugin installation is disabled.', HttpStatus.CONFLICT);
    }
    const manifest = installation.version.manifestJson as unknown as PluginManifest;
    if (!validateHookDeclared(manifest, command.data.hook)) {
      throw new AppException('PLUGIN_HOOK_NOT_FOUND', `Hook "${command.data.hook}" is not declared by this plugin.`, HttpStatus.NOT_FOUND);
    }
    if (!installation.version.sourceCode) {
      throw new AppException('PLUGIN_EXECUTION_FAILED', 'This plugin version has no executable source.', HttpStatus.CONFLICT);
    }

    try {
      const result = await this.sandbox.run({
        source: installation.version.sourceCode,
        hook: command.data.hook,
        input: command.data.input,
        permissions: installation.version.permissions,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AppException('PLUGIN_EXECUTION_FAILED', message, HttpStatus.UNPROCESSABLE_ENTITY);
    }
  }
}
