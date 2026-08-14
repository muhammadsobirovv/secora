import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { ApiKeyDto, CreateApiKeyResultDto, RotateApiKeyResultDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { CreateApiKeyDto, ListApiKeysQueryParamsDto } from '../dto/public-api.dto.js';
import { CreateApiKeyCommand, RevokeApiKeyCommand, RotateApiKeyCommand } from '../commands/api-keys.commands.js';
import { ListApiKeysQuery } from '../queries/api-keys.query.js';

/// Personal + Workspace API Keys (Module 9). See `guards/
/// api-key-auth.guard.ts` for how a minted key is later used to
/// authenticate against whichever routes opt into `ApiKeyAuthGuard`.
@ApiTags('public-api')
@ApiBearerAuth()
@Controller('public-api/keys')
export class ApiKeysController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List your personal API keys, or a workspace\'s keys' })
  list(@Query() query: ListApiKeysQueryParamsDto, @CurrentUser() user: RequestUser): Promise<ApiKeyDto[]> {
    return this.queryBus.execute(new ListApiKeysQuery(user.id, query));
  }

  @Post()
  @ApiOperation({ summary: 'Create an API key — the raw key is returned once, here, only' })
  create(@Body() dto: CreateApiKeyDto, @CurrentUser() user: RequestUser): Promise<CreateApiKeyResultDto> {
    return this.commandBus.execute(new CreateApiKeyCommand(user.id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an API key' })
  async revoke(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<void> {
    await this.commandBus.execute(new RevokeApiKeyCommand(user.id, id));
  }

  // Module 15 — API key management (task #336)
  @Post(':id/rotate')
  @ApiOperation({ summary: 'Rotate an API key — mints a replacement and immediately revokes the original' })
  rotate(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<RotateApiKeyResultDto> {
    return this.commandBus.execute(new RotateApiKeyCommand(user.id, id));
  }
}
