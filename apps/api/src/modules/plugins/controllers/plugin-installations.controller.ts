import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { ExecutePluginHookResultDto, PluginInstallationDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { ExecutePluginHookDto, InstallPluginDto, UpdatePluginInstallationDto } from '../dto/plugins.dto.js';
import {
  ExecutePluginHookCommand,
  InstallPluginCommand,
  UninstallPluginCommand,
  UpdatePluginInstallationCommand,
} from '../commands/plugin-installations.commands.js';
import { ListPluginInstallationsQuery } from '../queries/plugin-installations.query.js';

@ApiTags('plugins')
@ApiBearerAuth()
@Controller('enterprise/organizations/:organizationId/plugin-installations')
export class PluginInstallationsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List installed plugins for an organization/workspace' })
  list(
    @Param('organizationId') organizationId: string,
    @Query('workspaceId') workspaceId: string | undefined,
    @CurrentUser() user: RequestUser,
  ): Promise<PluginInstallationDto[]> {
    return this.queryBus.execute(new ListPluginInstallationsQuery(user.id, organizationId, workspaceId));
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
}
