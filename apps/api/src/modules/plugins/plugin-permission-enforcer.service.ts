import { HttpStatus, Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import type { PluginPermissionStatusDto } from '@pentesthub/shared';
import { AppException } from '../../common/exceptions/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PluginPermissionGrantedEvent } from './events/plugin-events.js';

/// Module 15 — Plugin permission declarations + enforcement (task #334).
/// `PluginVersion.permissions` (Module 10, free-form `String[]`) is what
/// a plugin *declares* it wants; `PluginPermissionGrant` (task #325's
/// schema addition) is what an org admin actually *granted*. Before this
/// pass, `ExecutePluginHookHandler` handed the sandbox the full declared
/// list unconditionally — grants existed in the schema but nothing wrote
/// or read them, so "enforcement" was only ever disclosure. This service
/// is the one place that gap closes.
///
/// Backward compatibility: an installation created before this pass has
/// zero `PluginPermissionGrant` rows. Rather than silently revoking every
/// permission every already-installed plugin was running with (a
/// behavior change with no user action behind it), `resolveEffective()`
/// treats "zero grant rows ever recorded" as "not yet migrated to
/// explicit grants" and falls back to the full declared set — the same
/// posture the install flow already had. Any installation with at least
/// one grant row (every install/permission-update going through
/// `InstallPluginHandler`/this service from this pass forward always
/// creates grant rows) is enforced strictly to the granted subset.
@Injectable()
export class PluginPermissionEnforcerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBus,
  ) {}

  async resolveEffective(installationId: string, declaredPermissions: string[]): Promise<string[]> {
    const grants = await this.prisma.pluginPermissionGrant.findMany({ where: { pluginInstallationId: installationId } });
    if (grants.length === 0) {
      return declaredPermissions;
    }
    const grantedSet = new Set(grants.map((grant) => grant.permission));
    return declaredPermissions.filter((permission) => grantedSet.has(permission));
  }

  /// Idempotent — `skipDuplicates` means re-granting an already-granted
  /// permission is a no-op rather than a unique-constraint error. Every
  /// requested permission must be a subset of the installation's current
  /// version's declared permissions; requesting anything else is
  /// rejected outright rather than silently dropped.
  async grant(installationId: string, permissions: string[], grantedByUserId: string): Promise<PluginPermissionStatusDto> {
    const installation = await this.prisma.pluginInstallation.findUnique({
      where: { id: installationId },
      include: { version: true },
    });
    if (!installation) {
      throw new AppException('PLUGIN_INSTALLATION_NOT_FOUND', 'Plugin installation not found.', HttpStatus.NOT_FOUND);
    }
    const declared = new Set(installation.version.permissions);
    const notDeclared = permissions.filter((permission) => !declared.has(permission));
    if (notDeclared.length > 0) {
      throw new AppException(
        'PLUGIN_PERMISSION_NOT_DECLARED',
        `Cannot grant permissions this plugin version never declared: ${notDeclared.join(', ')}.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (permissions.length > 0) {
      await this.prisma.pluginPermissionGrant.createMany({
        data: permissions.map((permission) => ({ pluginInstallationId: installationId, permission, grantedByUserId })),
        skipDuplicates: true,
      });
      // Module 15 — Webhook platform improvements (task #337), new event
      // `plugin_permission.granted` — see PluginPermissionGrantedEvent's
      // doc comment for why this only fires for workspace-scoped
      // installations.
      if (installation.workspaceId) {
        this.eventBus.publish(
          new PluginPermissionGrantedEvent(installation.workspaceId, grantedByUserId, installationId, {
            pluginId: installation.pluginId,
            permissions,
          }),
        );
      }
    }
    return this.getStatus(installationId);
  }

  async revoke(installationId: string, permission: string): Promise<PluginPermissionStatusDto> {
    await this.prisma.pluginPermissionGrant.deleteMany({ where: { pluginInstallationId: installationId, permission } });
    return this.getStatus(installationId);
  }

  async getStatus(installationId: string): Promise<PluginPermissionStatusDto> {
    const installation = await this.prisma.pluginInstallation.findUnique({
      where: { id: installationId },
      include: { version: true, permissionGrants: true },
    });
    if (!installation) {
      throw new AppException('PLUGIN_INSTALLATION_NOT_FOUND', 'Plugin installation not found.', HttpStatus.NOT_FOUND);
    }
    const declared = installation.version.permissions;
    const grantedPermissions = new Set(installation.permissionGrants.map((grant) => grant.permission));
    return {
      pluginInstallationId: installationId,
      declared,
      granted: installation.permissionGrants.map((grant) => ({
        permission: grant.permission as PluginPermissionStatusDto['granted'][number]['permission'],
        grantedByUserId: grant.grantedByUserId,
        grantedAt: grant.grantedAt.toISOString(),
      })),
      pending: declared.filter((permission) => !grantedPermissions.has(permission)),
    };
  }
}
