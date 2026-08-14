import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryBus } from '@nestjs/cqrs';
import type { AiProviderMarketplaceEntryDto, AiProviderStatusDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { ListAiProvidersQuery } from '../queries/list-ai-providers.query.js';
import { ListAiProviderMarketplaceQuery } from '../queries/list-ai-provider-marketplace.query.js';

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai/providers')
export class AiProvidersController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiOperation({ summary: 'List AI providers and whether each is configured' })
  list(@CurrentUser() user: RequestUser): Promise<AiProviderStatusDto[]> {
    return this.queryBus.execute(new ListAiProvidersQuery(user.id));
  }

  /// Module 15 — AI provider marketplace (BYOK expansion, task #341). A
  /// separate, more specific path (not a query param on GET /ai/providers)
  /// so the two response shapes stay independently versionable and the
  /// route reads clearly in Swagger/API docs.
  @Get('marketplace')
  @ApiOperation({ summary: "Browse the AI provider marketplace catalog with this workspace's live status merged in" })
  listMarketplace(@CurrentUser() user: RequestUser): Promise<AiProviderMarketplaceEntryDto[]> {
    return this.queryBus.execute(new ListAiProviderMarketplaceQuery(user.id));
  }
}
