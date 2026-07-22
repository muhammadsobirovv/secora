import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import type {
  SuggestAttackPathsResultDto,
  SummarizeEngagementResultDto,
} from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import {
  SuggestAttackPathsDto,
  SummarizeEngagementDto,
} from '../dto/engagement-ai-assist.dto.js';
import {
  SuggestAttackPathsCommand,
  SummarizeEngagementCommand,
} from '../commands/engagement-ai-assist.commands.js';

/// Workspace/engagement-level AI capabilities that aren't scoped to a
/// single finding — attack-path suggestions and an engagement rollup
/// summary. The 7 finding-scoped AI capabilities live on
/// BugBountyFindingsController (`:id/ai/...`) instead, since they need a
/// finding id in the path; these two don't.
@ApiTags('bugbounty')
@ApiBearerAuth()
@Controller('bugbounty/ai')
export class BugBountyAiAssistantController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('suggest-attack-paths')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'AI-suggested attack paths, optionally scoped to a target and/or finding',
  })
  suggestAttackPaths(
    @Body() dto: SuggestAttackPathsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<SuggestAttackPathsResultDto> {
    return this.commandBus.execute(
      new SuggestAttackPathsCommand(user.id, dto),
    );
  }

  @Post('summarize-engagement')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'AI-generated engagement summary with key findings and next steps',
  })
  summarizeEngagement(
    @Body() dto: SummarizeEngagementDto,
    @CurrentUser() user: RequestUser,
  ): Promise<SummarizeEngagementResultDto> {
    return this.commandBus.execute(
      new SummarizeEngagementCommand(user.id, dto),
    );
  }
}
