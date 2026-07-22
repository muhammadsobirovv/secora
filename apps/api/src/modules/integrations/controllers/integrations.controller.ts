import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type {
  ExecuteIntegrationActionResultDto,
  IntegrationCapabilityDto,
  IntegrationConnectionDto,
  StartOAuthConnectionResultDto,
  TestIntegrationConnectionResultDto,
} from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { Public } from '../../../common/decorators/public.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import {
  CompleteOAuthConnectionDto,
  ConnectIntegrationDto,
  ExecuteIntegrationActionDto,
  StartOAuthConnectionDto,
  UpdateIntegrationConnectionDto,
} from '../dto/integrations.dto.js';
import {
  ConnectIntegrationCommand,
  DisconnectIntegrationCommand,
  TestIntegrationConnectionCommand,
  UpdateIntegrationConnectionCommand,
} from '../commands/integration-connections.commands.js';
import { CompleteOAuthConnectionCommand, StartOAuthConnectionCommand } from '../commands/integration-oauth.commands.js';
import { ExecuteIntegrationActionCommand } from '../commands/integration-actions.commands.js';
import { ListIntegrationConnectionsQuery } from '../queries/integration-connections.query.js';
import { IntegrationAdapterRegistryService } from '../integration-adapter-registry.service.js';

/// Native Integrations — organization-scoped connection management
/// (token/PAT connect, OAuth connect, test, execute) for the 15 built-in
/// providers. `GET /integrations/capabilities` is intentionally the one
/// flat, non-org-scoped route on this controller (it's static per-build
/// metadata, not tenant data), mirroring how `PluginsController` keeps
/// the shared catalog flat while installs are org-scoped.
@ApiTags('integrations')
@ApiBearerAuth()
@Controller()
export class IntegrationsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly registry: IntegrationAdapterRegistryService,
  ) {}

  @Get('integrations/capabilities')
  @Public()
  @ApiOperation({ summary: 'List every native integration provider, its supported actions, and auth method' })
  capabilities(): IntegrationCapabilityDto[] {
    return this.registry.listCapabilities();
  }

  @Get('enterprise/organizations/:organizationId/integrations')
  @ApiOperation({ summary: 'List connected integrations for an organization (optionally filtered by workspace)' })
  list(
    @Param('organizationId') organizationId: string,
    @Query('workspaceId') workspaceId: string | undefined,
    @CurrentUser() user: RequestUser,
  ): Promise<IntegrationConnectionDto[]> {
    return this.queryBus.execute(new ListIntegrationConnectionsQuery(user.id, organizationId, workspaceId));
  }

  @Post('enterprise/organizations/:organizationId/integrations')
  @ApiOperation({ summary: 'Connect a provider via a directly-supplied token/PAT (ADMIN+)' })
  connect(
    @Param('organizationId') organizationId: string,
    @Body() dto: ConnectIntegrationDto,
    @CurrentUser() user: RequestUser,
  ): Promise<IntegrationConnectionDto> {
    return this.commandBus.execute(new ConnectIntegrationCommand(user.id, organizationId, dto));
  }

  @Patch('enterprise/organizations/:organizationId/integrations/:id')
  @ApiOperation({ summary: 'Update a connection (display name / rotate token / config) (ADMIN+)' })
  update(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateIntegrationConnectionDto,
    @CurrentUser() user: RequestUser,
  ): Promise<IntegrationConnectionDto> {
    return this.commandBus.execute(new UpdateIntegrationConnectionCommand(user.id, organizationId, id, dto));
  }

  @Delete('enterprise/organizations/:organizationId/integrations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Disconnect an integration (ADMIN+)' })
  async disconnect(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(new DisconnectIntegrationCommand(user.id, organizationId, id));
  }

  @Post('enterprise/organizations/:organizationId/integrations/:id/test')
  @ApiOperation({ summary: 'Re-verify a connection\'s credential still works' })
  test(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<TestIntegrationConnectionResultDto> {
    return this.commandBus.execute(new TestIntegrationConnectionCommand(user.id, organizationId, id));
  }

  @Post('enterprise/organizations/:organizationId/integrations/:id/execute')
  @ApiOperation({ summary: 'Invoke a supported provider action (e.g. createIssue, sendMessage, uploadFile)' })
  execute(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: ExecuteIntegrationActionDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ExecuteIntegrationActionResultDto> {
    return this.commandBus.execute(new ExecuteIntegrationActionCommand(user.id, organizationId, id, dto));
  }

  @Post('enterprise/organizations/:organizationId/integrations/oauth/start')
  @ApiOperation({ summary: 'Begin an OAuth2 connect flow for an OAuth-capable provider (ADMIN+)' })
  oauthStart(
    @Param('organizationId') organizationId: string,
    @Body() dto: StartOAuthConnectionDto,
    @CurrentUser() user: RequestUser,
  ): Promise<StartOAuthConnectionResultDto> {
    return this.commandBus.execute(new StartOAuthConnectionCommand(user.id, organizationId, dto));
  }

  @Post('enterprise/organizations/:organizationId/integrations/oauth/complete')
  @ApiOperation({ summary: 'Complete an OAuth2 connect flow with the provider\'s authorization code (ADMIN+)' })
  oauthComplete(
    @Param('organizationId') organizationId: string,
    @Body() dto: CompleteOAuthConnectionDto,
    @CurrentUser() user: RequestUser,
  ): Promise<IntegrationConnectionDto> {
    return this.commandBus.execute(new CompleteOAuthConnectionCommand(user.id, organizationId, dto));
  }
}
