import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryBus } from '@nestjs/cqrs';
import type { AiProviderStatusDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { ListAiProvidersQuery } from '../queries/list-ai-providers.query.js';

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
}
