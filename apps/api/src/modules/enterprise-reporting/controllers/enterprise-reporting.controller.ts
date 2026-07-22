import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { EnterpriseReportDto, ReportScheduleDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { CreateReportScheduleDto, GenerateEnterpriseReportDto, UpdateReportScheduleDto } from '../dto/enterprise-reporting.dto.js';
import {
  CreateReportScheduleCommand,
  DeleteReportScheduleCommand,
  GenerateEnterpriseReportCommand,
  UpdateReportScheduleCommand,
} from '../commands/enterprise-reports.commands.js';
import {
  GetEnterpriseReportQuery,
  ListEnterpriseReportsQuery,
  ListReportSchedulesQuery,
} from '../queries/enterprise-reports.query.js';

@ApiTags('enterprise-reporting')
@ApiBearerAuth()
@Controller('enterprise/organizations/:organizationId')
export class EnterpriseReportingController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('reports')
  @ApiOperation({ summary: 'List generated enterprise reports for an organization' })
  list(@Param('organizationId') organizationId: string, @CurrentUser() user: RequestUser): Promise<EnterpriseReportDto[]> {
    return this.queryBus.execute(new ListEnterpriseReportsQuery(user.id, organizationId));
  }

  @Post('reports')
  @ApiOperation({ summary: 'Generate a report now, computed from live data (TEAM_LEAD+)' })
  generate(
    @Param('organizationId') organizationId: string,
    @Body() dto: GenerateEnterpriseReportDto,
    @CurrentUser() user: RequestUser,
  ): Promise<EnterpriseReportDto> {
    return this.commandBus.execute(new GenerateEnterpriseReportCommand(user.id, organizationId, dto));
  }

  @Get('reports/:id')
  @ApiOperation({ summary: 'Get a generated report' })
  get(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<EnterpriseReportDto> {
    return this.queryBus.execute(new GetEnterpriseReportQuery(user.id, organizationId, id));
  }

  @Get('report-schedules')
  @ApiOperation({ summary: 'List recurring report schedules' })
  listSchedules(@Param('organizationId') organizationId: string, @CurrentUser() user: RequestUser): Promise<ReportScheduleDto[]> {
    return this.queryBus.execute(new ListReportSchedulesQuery(user.id, organizationId));
  }

  @Post('report-schedules')
  @ApiOperation({ summary: 'Create a recurring report schedule (ADMIN+)' })
  createSchedule(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateReportScheduleDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ReportScheduleDto> {
    return this.commandBus.execute(new CreateReportScheduleCommand(user.id, organizationId, dto));
  }

  @Patch('report-schedules/:id')
  @ApiOperation({ summary: 'Update a report schedule (ADMIN+)' })
  updateSchedule(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateReportScheduleDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ReportScheduleDto> {
    return this.commandBus.execute(new UpdateReportScheduleCommand(user.id, organizationId, id, dto));
  }

  @Delete('report-schedules/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a report schedule (ADMIN+)' })
  async deleteSchedule(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(new DeleteReportScheduleCommand(user.id, organizationId, id));
  }
}
