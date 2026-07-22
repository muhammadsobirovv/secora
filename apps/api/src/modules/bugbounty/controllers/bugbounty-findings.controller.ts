import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import type {
  BugBountyFindingDto,
  CalculateSeverityResultDto,
  CheckDuplicateFindingResultDto,
  GenerateImpactResultDto,
  GeneratePocResultDto,
  GenerateRemediationResultDto,
  GenerateReproStepsResultDto,
  ReviewFindingResultDto,
  SuggestPayloadsResultDto,
} from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import {
  CheckDuplicateFindingDto,
  CreateBugBountyFindingDto,
  ListBugBountyFindingsQueryParamsDto,
  TransitionBugBountyFindingStageDto,
  UpdateBugBountyFindingDto,
} from '../dto/finding.dto.js';
import {
  CalculateSeverityDto,
  GenerateImpactDto,
  GeneratePocDto,
  GenerateRemediationDto,
  GenerateReproStepsDto,
  ReviewFindingDto,
  SuggestPayloadsDto,
} from '../dto/finding-ai-assist.dto.js';
import {
  CreateBugBountyFindingCommand,
  DeleteBugBountyFindingCommand,
  TransitionBugBountyFindingStageCommand,
  UpdateBugBountyFindingCommand,
} from '../commands/bugbounty-finding-lifecycle.commands.js';
import {
  CalculateSeverityCommand,
  GenerateImpactCommand,
  GeneratePocCommand,
  GenerateRemediationCommand,
  GenerateReproStepsCommand,
  ReviewFindingCommand,
  SuggestPayloadsCommand,
} from '../commands/finding-ai-assist.commands.js';
import { CheckDuplicateFindingQuery } from '../queries/check-duplicate-finding.query.js';
import {
  GetBugBountyFindingQuery,
  ListBugBountyFindingsQuery,
} from '../queries/bugbounty-finding.queries.js';

/// `duplicate-check` is declared before `:id` so it isn't swallowed by
/// the parameterized route (same reasoning as VulnFindingsController's
/// `bulk-status`).
@ApiTags('bugbounty')
@ApiBearerAuth()
@Controller('bugbounty/findings')
export class BugBountyFindingsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List bug bounty findings' })
  list(
    @Query() query: ListBugBountyFindingsQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<BugBountyFindingDto[]> {
    return this.queryBus.execute(
      new ListBugBountyFindingsQuery(user.id, query),
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create a bug bounty finding' })
  create(
    @Body() dto: CreateBugBountyFindingDto,
    @CurrentUser() user: RequestUser,
  ): Promise<BugBountyFindingDto> {
    return this.commandBus.execute(
      new CreateBugBountyFindingCommand(user.id, dto),
    );
  }

  @Post('duplicate-check')
  @ApiOperation({
    summary:
      'Check a candidate finding against existing findings for duplicates',
  })
  checkDuplicate(
    @Body() dto: CheckDuplicateFindingDto,
    @CurrentUser() user: RequestUser,
  ): Promise<CheckDuplicateFindingResultDto> {
    return this.queryBus.execute(new CheckDuplicateFindingQuery(user.id, dto));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a bug bounty finding' })
  get(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<BugBountyFindingDto> {
    return this.queryBus.execute(new GetBugBountyFindingQuery(user.id, id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a bug bounty finding' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBugBountyFindingDto,
    @CurrentUser() user: RequestUser,
  ): Promise<BugBountyFindingDto> {
    return this.commandBus.execute(
      new UpdateBugBountyFindingCommand(user.id, id, dto),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a bug bounty finding' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(
      new DeleteBugBountyFindingCommand(user.id, id),
    );
  }

  @Patch(':id/stage')
  @ApiOperation({ summary: 'Transition a finding’s lifecycle stage' })
  transitionStage(
    @Param('id') id: string,
    @Body() dto: TransitionBugBountyFindingStageDto,
    @CurrentUser() user: RequestUser,
  ): Promise<BugBountyFindingDto> {
    return this.commandBus.execute(
      new TransitionBugBountyFindingStageCommand(user.id, id, dto),
    );
  }

  // -- AI Bug Bounty Assistant ----------------------------------------------

  @Post(':id/ai/review')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @ApiOperation({ summary: 'AI review of a finding: gaps, suggested severity/CVSS' })
  aiReview(
    @Param('id') id: string,
    @Body() dto: ReviewFindingDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ReviewFindingResultDto> {
    return this.commandBus.execute(new ReviewFindingCommand(user.id, id, dto));
  }

  @Post(':id/ai/suggest-payloads')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @ApiOperation({ summary: 'AI-suggested test payloads for a finding’s vuln type' })
  aiSuggestPayloads(
    @Param('id') id: string,
    @Body() dto: SuggestPayloadsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<SuggestPayloadsResultDto> {
    return this.commandBus.execute(
      new SuggestPayloadsCommand(user.id, id, dto),
    );
  }

  @Post(':id/ai/generate-poc')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @ApiOperation({ summary: 'AI-generated proof-of-concept for a finding' })
  aiGeneratePoc(
    @Param('id') id: string,
    @Body() dto: GeneratePocDto,
    @CurrentUser() user: RequestUser,
  ): Promise<GeneratePocResultDto> {
    return this.commandBus.execute(new GeneratePocCommand(user.id, id, dto));
  }

  @Post(':id/ai/generate-repro-steps')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @ApiOperation({ summary: 'AI-generated step-by-step reproduction instructions' })
  aiGenerateReproSteps(
    @Param('id') id: string,
    @Body() dto: GenerateReproStepsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<GenerateReproStepsResultDto> {
    return this.commandBus.execute(
      new GenerateReproStepsCommand(user.id, id, dto),
    );
  }

  @Post(':id/ai/generate-impact')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @ApiOperation({ summary: 'AI-generated business/technical impact narrative' })
  aiGenerateImpact(
    @Param('id') id: string,
    @Body() dto: GenerateImpactDto,
    @CurrentUser() user: RequestUser,
  ): Promise<GenerateImpactResultDto> {
    return this.commandBus.execute(
      new GenerateImpactCommand(user.id, id, dto),
    );
  }

  @Post(':id/ai/generate-remediation')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @ApiOperation({ summary: 'AI-generated remediation/mitigation guidance' })
  aiGenerateRemediation(
    @Param('id') id: string,
    @Body() dto: GenerateRemediationDto,
    @CurrentUser() user: RequestUser,
  ): Promise<GenerateRemediationResultDto> {
    return this.commandBus.execute(
      new GenerateRemediationCommand(user.id, id, dto),
    );
  }

  @Post(':id/ai/calculate-severity')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'AI-proposed CVSS 3.1 vector, scored deterministically by the CVSS calculator',
  })
  aiCalculateSeverity(
    @Param('id') id: string,
    @Body() dto: CalculateSeverityDto,
    @CurrentUser() user: RequestUser,
  ): Promise<CalculateSeverityResultDto> {
    return this.commandBus.execute(
      new CalculateSeverityCommand(user.id, id, dto),
    );
  }
}
