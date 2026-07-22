import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import type { PluginDto, PluginRatingDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import {
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
  ListPluginRatingsQuery,
  ListPluginsQuery,
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
