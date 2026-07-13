import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { VulnFindingDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { ListVulnFindingsQueryParamsDto } from '../dto/list-vuln-findings-query.dto.js';
import { UpdateVulnFindingStatusDto } from '../dto/update-vuln-finding-status.dto.js';
import { BulkUpdateVulnFindingsDto } from '../dto/bulk-update-vuln-findings.dto.js';
import { GetVulnFindingQuery } from '../queries/get-vuln-finding.query.js';
import { ListVulnFindingsQuery } from '../queries/list-vuln-findings.query.js';
import { UpdateVulnFindingStatusCommand } from '../commands/update-vuln-finding-status.command.js';
import { BulkUpdateVulnFindingsCommand } from '../commands/bulk-update-vuln-findings.command.js';

/// Flat /vuln/findings — the spec's "Findings" + "Finding Details" API
/// endpoints, plus the Bulk Actions the frontend Findings page needs.
/// `bulk-status` is declared before `:findingId/*` so it isn't swallowed
/// by the parameterized routes.
@ApiTags('vuln')
@ApiBearerAuth()
@Controller('vuln/findings')
export class VulnFindingsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List vulnerability findings (search/filter)' })
  list(
    @Query() query: ListVulnFindingsQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<VulnFindingDto[]> {
    return this.queryBus.execute(new ListVulnFindingsQuery(user.id, query));
  }

  @Post('bulk-status')
  @ApiOperation({ summary: 'Bulk-update the status of multiple findings' })
  bulkUpdateStatus(
    @Body() dto: BulkUpdateVulnFindingsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<VulnFindingDto[]> {
    return this.commandBus.execute(
      new BulkUpdateVulnFindingsCommand(user.id, dto),
    );
  }

  @Get(':findingId')
  @ApiOperation({ summary: 'Get a vulnerability finding' })
  get(
    @Param('findingId') findingId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<VulnFindingDto> {
    return this.queryBus.execute(new GetVulnFindingQuery(user.id, findingId));
  }

  @Patch(':findingId/status')
  @ApiOperation({ summary: 'Update a finding’s triage status' })
  updateStatus(
    @Param('findingId') findingId: string,
    @Body() dto: UpdateVulnFindingStatusDto,
    @CurrentUser() user: RequestUser,
  ): Promise<VulnFindingDto> {
    return this.commandBus.execute(
      new UpdateVulnFindingStatusCommand(user.id, findingId, dto),
    );
  }
}
