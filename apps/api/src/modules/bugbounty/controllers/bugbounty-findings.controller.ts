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
import type {
  BugBountyFindingDto,
  CheckDuplicateFindingResultDto,
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
  CreateBugBountyFindingCommand,
  DeleteBugBountyFindingCommand,
  TransitionBugBountyFindingStageCommand,
  UpdateBugBountyFindingCommand,
} from '../commands/bugbounty-finding-lifecycle.commands.js';
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
    return this.comma