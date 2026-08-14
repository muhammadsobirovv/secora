import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type {
  ExecutePluginHookResultDto,
  PluginAvailableUpdateDto,
  PluginInstallationDto,
  PluginPermissionStatusDto,
} from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { ExecutePluginHookDto, InstallPluginDto, UpdatePluginInstallationDto } from '../dto/plugins.dto.js';
import { GrantPluginPermissionsBodyDto } from '../dto/marketplace-security.dto.js';
import {
  ExecutePluginHookCommand,
  InstallPluginCommand,
  UninstallPluginCommand,
  UpdatePluginInstallationCommand,
} from '../commands/plugin-installations.commands.js';
import {
  GetAvailablePluginUpdatesQuery,
  ListPluginInstallationsQuery,
} from '../queries/plugin-installations.query.js';
import { PluginPermissionEnforcerService } from '../plugin-permission-enforcer.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveOrganizationMembership } from '../../enterprise/organization-membership.util.js';
import { requireEnterpriseRole } from '../../enterprise/enterprise-permissions.util.js';

@ApiTags('plugins')
@ApiBearerAuth()
@Controller('enterprise/organizations/:organizationId/plugin-installations')
export class PluginInstallationsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly permissionEnforcer: PluginPermissionEnforcerService,
    private readonly prisma: PrismaService,
  ) {}

  /// Every permission-management endpoint below calls the plain
  /// `PluginPermissionEnforcerService` directly (not `CommandBus`), so
  /// unlike `install`/`update`/`uninstall` above it doesn't get the
  /// ADMIN+ check for free from inside a command handler — this
  /// re-establishes the exact same `resolveOrganizationMembership` +
  /// `requireEnterpriseRole(role, 'ADMIN')` gate those handlers use.
  private async requireAdmin(userId: string, organizationId: string): Promise<void> {
    const { role } = await resolveOrganizationMembership(this.prisma, userId, organizationId);
    requireEnterpriseRole(role, 'ADMIN');
  }

  @Get()
  @ApiOperation({ summary: 'List installed plugins for an organization/workspace' })
  list(
    @Param('organizationId') organizationId: string,
    @Query('workspaceId') workspaceId: string | undefined,
    @CurrentUser() user: RequestUser,
  ): Promise<PluginInstallationDto[]> {
    return this.queryBus.execute(new ListPluginInstallationsQuery(user.id, organizationId, workspaceId));
  }

  // Module 14 — Auto Update. Declared before any `:id`-shaped route so
  // Express never mistakes the literal segment "updates" for an
  // installation ID (no conflict exists today — no other `@Get(':id')`
  // route is registered on this controller — but this ordering is the
  // defensive default regardless).
  @Get('updates')
  @ApiOperation({ summary: 'List installed plugins that have a newer non-deprecated version available' })
  availableUpdates(
    @Param('organizationId') organizationId: string,
    @Query('workspaceId') workspaceId: string | undefined,
    @CurrentUser() user: RequestUser,
  ): Promise<PluginAvailableUpdateDto[]> {
    return this.queryBus.execute(new GetAvailablePluginUpdatesQuery(user.id, organizationId, workspaceId));
  }

  @Post()
  @ApiOperation({ summary: 'Install a plugin version (ADMIN+, dependency-checked, permission-consented)' })
  install(
    @Param('organizationId') organizationId: string,
    @Body() dto: InstallPluginDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PluginInstallationDto> {
    return this.commandBus.execute(new InstallPluginCommand(user.id, organizationId, dto));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an installation (upgrade version / enable-disable / config) (ADMIN+)' })
  update(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePluginInstallationDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PluginInstallationDto> {
    return this.commandBus.execute(new UpdatePluginInstallationCommand(user.id, organizationId, id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Uninstall a plugin (ADMIN+)' })
  async uninstall(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(new UninstallPluginCommand(user.id, organizationId, id));
  }

  @Post(':id/execute')
  @ApiOperation({ summary: 'Invoke a declared hook on an installed plugin (sandboxed execution)' })
  execute(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: ExecutePluginHookDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ExecutePluginHookResultDto> {
    return this.commandBus.execute(new ExecutePluginHookCommand(user.id, organizationId, id, dto));
  }

  // Module 15 — Plugin permission declarations + enforcement (task #334)

  @Get(':id/permissions')
  @ApiOperation({ summary: 'Declared vs. granted vs. pending permissions for an installation' })
  async getPermissions(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<PluginPermissionStatusDto> {
    await resolveOrganizationMembership(this.prisma, user.id, organizationId);
    return this.permissionEnforcer.getStatus(id);
  }

  @Post(':id/permissions/grant')
  @ApiOperation({ summary: 'Grant one or more declared-but-not-yet-granted permissions (ADMIN+)' })
  async grantPermissions(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: GrantPluginPermissionsBodyDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PluginPermissionStatusDto> {
    await this.requireAdmin(user.id, organizationId);
    return this.permissionEnforcer.grant(id, dto.permissions, user.id);
  }

  @Delete(':id/permissions/:permission')
  @ApiOperation({ summary: 'Revoke a previously granted permission (ADMIN+)' })
  async revokePermission(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Param('permission') permission: string,
    @CurrentUser() user: RequestUser,
  ): Promise<PluginPermissionStatusDto> {
    await this.requireAdmin(user.id, organizationId);
    return this.permissionEnforcer.revoke(id, permission);
  }
}
