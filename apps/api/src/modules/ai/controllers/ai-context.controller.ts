import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryBus } from '@nestjs/cqrs';
import type {
  AiContextSummaryDto,
  AiSuggestedQuestionDto,
} from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { GetAiContextSummaryQuery } from '../queries/get-ai-context-summary.query.js';
import { GetAiSuggestedQuestionsQuery } from '../queries/get-ai-suggested-questions.query.js';

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai/context')
export class AiContextController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get(':projectId')
  @ApiOperation({
    summary:
      'What the AI currently knows about this project (Context Indicator)',
  })
  summary(
    @Param('projectId') projectId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<AiContextSummaryDto> {
    return this.queryBus.execute(
      new GetAiContextSummaryQuery(user.id, projectId),
    );
  }

  @Get(':projectId/suggested-questions')
  @ApiOperation({ summary: 'Suggested starter questions for this project' })
  suggestedQuestions(
    @Param('projectId') projectId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<AiSuggestedQuestionDto[]> {
    return this.queryBus.execute(
      new GetAiSuggestedQuestionsQuery(user.id, projectId),
    );
  }
}
