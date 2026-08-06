import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import type { PluginDto, PluginRatingDto, WorkspacePluginCapabilityDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import {
  ListMarketplacePacksQueryParamsDto,
  ListPluginsQueryParamsDto,
  PublishPluginDto,
  PublishPluginVersionDto,
  RatePluginDto,
  UpdatePluginDto,
} from '../dto/plugins.dto.js';
import { PublishPluginCommand, PublishPluginVersionCommand, UpdatePluginCommand } from '../commands/plugins.commands.js';
import { RatePluginCommand } from '../commands/plugin-ratings.commands.js';
import {
  GetPluginHandler,
  GetPluginQuery,
  ListMarketplacePacksQuery,
  ListPluginRatingsQuery,
  ListPluginsQuery,
  ListWorkspacePluginCapabilitiesQuery,
  type PluginDetailDto,
} from '../queries/plugins.query.js';

/// Plugin Registry — the marketplace catalog. Not organization-scoped
/// (`/plugins`, no `:organizationId`): a plugin is published once and can
/// be installed by any number of organizations, the same "shared catalog,
/// per-tenant install records" shape npm/VS Code Marketplace/etc. use.
/// Installation itself (org-specific) lives in
/// `plugin-installations.controller.ts` instead.
@ApiTags('plugins')
@ApiBearerAuth()
@Controller('plugins')
export class PluginsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List published plugins (category/status/search filterable)' })
  list(@Query() query: ListPluginsQueryParamsDto): Promise<PluginDto[]> {
    return this.queryBus.execute(new ListPluginsQuery(query));
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Publish a new plugin with its first version' })
  publish(@Body() dto: PublishPluginDto, @CurrentUser() user: RequestUser): Promise<PluginDto> {
    return this.commandBus.execute(new PublishPluginCommand(user.id, dto));
  }

  @Get('capabilities')
  @ApiOperation({
    summary:
      'Module 13 — Plugin SDK: list declared capabilities (commands/tools/pages/widgets/etc) across every enabled plugin installation in the caller\'s personal workspace',
  })
  listWorkspaceCapabilities(@CurrentUser() user: RequestUser): Promise<WorkspacePluginCapabilityDto[]> {
    return this.queryBus.execute(new ListWorkspacePluginCapabilitiesQuery(user.id));
  }

  @Get('marketplace/packs')
  @ApiOperation({
    summary:
      'Module 13 — Automation Marketplace: browse published packs (PROMPT_PACK/WORKFLOW_PACK/RECON_PACK/SCANNER_PACK/REPORT_TEMPLATE/PLAYBOOK/AGENT_PACK/THEME_PACK/LANGUAGE_PACK) — same publish/install/rate flow as any other plugin, just filtered to pack categories',
  })
  listMarketplacePacks(@Query() query: ListMarketplacePacksQueryParamsDto): Promise<PluginDto[]> {
    return this.queryBus.execute(new ListMarketplacePacksQuery(query));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a plugin with its full version history' })
  get(@Param('id') id: string): Promise<PluginDetailDto> {
    return this.queryBus.execute(new GetPluginQuery(id));
  }

  @Post(':id')
  @ApiOperation({ summary: 'Update plugin metadata (author only)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePluginDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PluginDto> {
    return this.commandBus.execute(new UpdatePluginCommand(user.id, id, dto));
  }

  @Post(':id/versions')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Publish a new version of an existing plugin (author only)' })
  publishVersion(
    @Param('id') id: string,
    @Body() dto: PublishPluginVersionDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PluginDto> {
    return this.commandBus.execute(new PublishPluginVersionCommand(user.id, id, dto));
  }

  @Get(':id/ratings')
  @ApiOperation({ summary: 'List ratings/reviews for a plugin' })
  listRatings(@Param('id') id: string): Promise<PluginRatingDto[]> {
    return this.queryBus.execute(new ListPluginRatingsQuery(id));
  }

  @Post(':id/ratings')
  @ApiOperation({ summary: 'Rate/review a plugin (1-5 stars, one per user, upserted)' })
  rate(
    @Param('id') id: string,
    @Body() dto: RatePluginDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PluginRatingDto> {
    return this.commandBus.execute(new RatePluginCommand(user.id, id, dto));
  }
}
