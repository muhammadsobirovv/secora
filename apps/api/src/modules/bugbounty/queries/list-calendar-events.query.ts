import { Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type {
  BugBountyCalendarEventDto,
  ListCalendarEventsQueryDto,
} from '@pentesthub/shared';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  BUGBOUNTY_CALENDAR_REPOSITORY,
  type BugBountyCalendarRepository,
} from '../domain/repositories/bugbounty-calendar.repository.interface.js';
import { resolveWorkspaceForCaller } from '../authorization.util.js';
import { toCalendarEventDto } from '../mappers/to-calendar-event-dto.mapper.js';
import { resolveCalendarEventForCaller } from '../commands/bugbounty-calendar.commands.js';

export class ListCalendarEventsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly filter: ListCalendarEventsQueryDto,
  ) {}
}

@QueryHandler(ListCalendarEventsQuery)
export class ListCalendarEventsHandler implements IQueryHandler<
  ListCalendarEventsQuery,
  BugBountyCalendarEventDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_CALENDAR_REPOSITORY)
    private readonly calendarRepository: BugBountyCalendarRepository,
  ) {}

  async execute(
    query: ListCalendarEventsQuery,
  ): Promise<BugBountyCalendarEventDto[]> {
    const workspace = await resolveWorkspaceForCaller(
      this.workspacesRepository,
      query.userId,
    );

    const events = await this.calendarRepository.list({
      workspaceId: workspace.id,
      from: query.filter.from ? new Date(query.filter.from) : undefined,
      to: query.filter.to ? new Date(query.filter.to) : undefined,
      type: query.filter.type,
      programId: query.filter.programId,
    });

    return events.map(toCalendarEventDto);
  }
}

export class GetCalendarEventQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly eventId: string,
  ) {}
}

@QueryHandler(GetCalendarEventQuery)
export class GetCalendarEventHandler implements IQueryHandler<
  GetCalendarEventQuery,
  BugBountyCalendarEventDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_CALENDAR_REPOSITORY)
    private readonly calendarRepository: BugBountyCalendarRepository,
  ) {}

  async execute(
    query: GetCalendarEventQuery,
  ): Promise<BugBountyCalendarEventDto> {
    const { event } = await resolveCalendarEventForCaller(
      this.workspacesRepository,
      this.calendarRepository,
      query.userId,
      query.eventId,
    );
    return toCalendarEventDto(event);
  }
}
