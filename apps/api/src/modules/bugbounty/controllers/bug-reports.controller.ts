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
  BugReportDto,
  ExportBugReportResultDto,
  GenerateBugReportDraftResultDto,
  RenderedBugReportDto,
} from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import {
  CreateBugReportDto,
  ExportBugReportDto,
  GenerateBugReportDraftDto,
  ListBugReportsQueryParamsDto,
  SubmitBugReportDto,
  UpdateBugReportDto,
} from '../dto/bug-report.dto.js';
import {
  CreateBugReportCommand,
  DeleteBugReportCommand,
  SubmitBugReportCommand,
  UpdateBugReportCommand,
} from '../commands/bug-report-lifecycle.commands.js';
import { GenerateBugReportDraftCommand } from '../commands/generate-bug-report-draft.command.js';
import {
  GetBugReportQuery,
  ListBugReportsQuery,
  RenderBugReportQuery,
} from '../queries/bug-report.queries.js';
import { ExportBugReportQuery } from '../queries/export-bug-report.query.js';

@ApiTags('bugbounty')
@ApiBearerAuth()
@Controller('bugbounty/reports')
export class BugReportsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List bug reports' })
  list(
    @Query() query: ListBugReportsQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<BugReportDto[]> {
    return this.queryBus.execute(new ListBugReportsQuery(user.id, query));
  }

  @Post()
  @ApiOperation({ summary: 'Create a bug report (starts in DRAFT)' })
  create(
    @Body() dto: CreateBugReportDto,
    @CurrentUser() user: RequestUser,
  ): Promise<BugReportDto> {
    return this.commandBus.execute(new CreateBugReportCommand(user.id, dto));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a bug report' })
  get(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<BugReportDto> {
    return this.queryBus.execute(new GetBugReportQuery(user.id, id));
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Update a bug report (optimistic locking — `version` must match the current row)',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBugReportDto,
    @CurrentUser() user: RequestUser,
  ): Promise<BugReportDto> {
    return this.commandBus.execute(
      new UpdateBugReportCommand(user.id, id, dto),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a bug report' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(new DeleteBugReportCommand(user.id, id));
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit a DRAFT report (DRAFT -> SUBMITTED)' })
  submit(
    @Param('id') id: string,
    @Body() dto: SubmitBugReportDto,
    @CurrentUser() user: RequestUser,
  ): Promise<BugReportDto> {
    return this.commandBus.execute(
      new SubmitBugReportCommand(user.id, id, dto),
    );
  }

  @Post(':id/draft')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Report Draft Assistant — AI-generate/refine this report’s content',
  })
  generateDraft(
    @Param('id') id: string,
    @Body() dto: GenerateBugReportDraftDto,
    @CurrentUser() user: RequestUser,
  ): Promise<GenerateBugReportDraftResultDto> {
    return this.commandBus.execute(
      new GenerateBugReportDraftCommand(user.id, id, dto),
    );
  }

  @Get(':id/render')
  @ApiOperation({
    summary:
      'Render this report using its own template (HackerOne/Bugcrowd/Intigriti/Markdown/HTML preview)',
  })
  render(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<RenderedBugReportDto> {
    return this.queryBus.execute(new RenderBugReportQuery(user.id, id));
  }

  @Post(':id/export')
  @ApiOperation({ summary: 'Export this report as PDF/Markdown/HTML/JSON/CSV' })
  export(
    @Param('id') id: string,
    @Body() dto: ExportBugReportDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ExportBugReportResult