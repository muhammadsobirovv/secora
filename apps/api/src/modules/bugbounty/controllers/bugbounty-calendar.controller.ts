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
import type { BugBountyCalendarEventDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import {
  CreateCalendarEventDto,
  ListCalendarEventsQueryParamsDto,
  UpdateCalendarEventDto,
} from '../dto/calendar.dto.js';
import {
  CreateCalendarEventCommand,
  DeleteCalendarEventCommand,
  UpdateCalendarEventCommand,
} from '../commands/bugbounty-calendar.commands.js';
import {
  GetCalendarEventQuery,
  ListCalendarEventsQuery,
} from '../queries/list-calendar-events.query.js';

@ApiTags('bugbounty')
@ApiBearerAuth()
@Controller('bugbounty/calendar')
export class BugBountyCalendarController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'List calendar events (submission deadlines, follow-ups, retests, disclosures)',
  })
  list(
    @Query() query: ListCalendarEventsQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<BugBountyCalendarEventDto[]> {
    return this.queryBus.execute(new ListCalendarEventsQuery(user.id, query));
  }

  @Post()
  @ApiOperation({ summary: 'Create a calendar event' })
  create(
    @Body() dto: CreateCalendarEventDto,
    @CurrentUser() user: RequestUser,
  ): Promise<BugBountyCalendarEventDto> {
    return this.commandBus.execute(
      new CreateCalendarEventCommand(user.id, dto),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a calendar event' })
  get(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<BugBountyCalendarEventDto> {
    return this.queryBus.execute(new GetCalendarEventQuery(user.id, id));
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a calendar event (or mark it complete via completedAt)',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCalendarEventDto,
    @CurrentUser() user: RequestUser,
  ): Promise<BugBountyCalendarEventDto> {
    return this.commandBus.execute(
      new UpdateCalendarEventCommand(user.id, id, dto),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a calendar event' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(new DeleteCalendarEventCommand(user.id, id));
  }
}
