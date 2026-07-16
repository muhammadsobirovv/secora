import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type {
  BugBountyCalendarEventDto,
  CreateCalendarEventRequestDto,
  UpdateCalendarEventRequestDto,
} from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
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

/// BugBountyCalendarRepository.findById() is not workspace-scoped at the
/// repository level (unlike the other Module 6 repositories' findById*
/// pair), so the ownership check happens here — same enumeration-safe-404
/// outcome as the repositories that do it themselves.
export async function resolveCalendarEventForCaller(
  workspacesRepository: WorkspacesRepository,
  calendarRepository: BugBountyCalendarRepository,
  userId: string,
  eventId: string,
) {
  const workspace = await resolveWorkspaceForCaller(
    workspacesRepository,
    userId,
  );
  const event = await calendarRepository.findById(eventId);
  if (!event || event.workspaceId !== workspace.id) {
    throw new AppException(
      'BUGBOUNTY_CALENDAR_EVENT_NOT_FOUND',
      'Calendar event not found.',
      HttpStatus.NOT_FOUND,
    );
  }
  return { workspaceId: workspace.id, event };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export class CreateCalendarEventCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: CreateCalendarEventRequestDto,
  ) {}
}

@CommandHandler(CreateCalendarEventCommand)
export class CreateCalendarEventHandler implements ICommandHandler<
  CreateCalendarEventCommand,
  BugBountyCalendarEventDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_CALENDAR_REPOSITORY)
    private readonly calendarRepository: BugBountyCalendarRepository,
  ) {}

  async execute(
    command: CreateCalendarEventCommand,
  ): Promise<BugBountyCalendarEventDto> {
    const workspace = await resolveWorkspaceForCaller(
      this.workspacesRepository,
      command.userId,
    );

    const event = await this.calendarRepository.create({
      workspaceId: workspace.id,
      programId: command.data.programId,
      reportId: command.data.reportId,
      type: command.data.type,
      title: command.data.title,
      dueAt: new Date(command.data.dueAt),
      notes: command.data.notes,
      createdBy: command.userId,
    });

    return toCalendarEventDto(event);
  }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export class UpdateCalendarEventCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly eventId: string,
    public readonly data: UpdateCalendarEventRequestDto,
  ) {}
}

@CommandHandler(UpdateCalendarEventCommand)
export class UpdateCalendarEventHandler implements ICommandHandler<
  UpdateCalendarEventCommand,
  BugBountyCalendarEventDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_CALENDAR_REPOSITORY)
    private readonly calendarRepository: BugBountyCalendarRepository,
  ) {}

  async execute(
    command: UpdateCalendarEventCommand,
  ): Promise<BugBountyCalendarEventDto> {
    await resolveCalendarEventForCaller(
      this.workspacesRepository,
      this.calendarRepository,
      command.userId,
      command.eventId,
    );

    const updated = await this.calendarRepository.update(command.eventId, {
      type: command.data.type,
      title: command.data.title,
      dueAt: command.data.dueAt ? new Date(command.data.dueAt) : undefined,
      notes: command.data.notes,
      completedAt:
        command.data.completedAt === undefined
          ? undefined
          : command.data.completedAt === null
            ? null
            : new Date(command.data.completedAt),
    });

    return toCalendarEventDto(updated);
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export class DeleteCalendarEventCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly eventId: string,
  ) {}
}

@CommandHandler(DeleteCalendarEventCommand)
export class DeleteCalendarEventHandler implements ICommandHandler<
  DeleteCalendarEventCommand,
  void
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_CALENDAR_REPOSITORY)
    private readonly calendarRepository: BugBountyCalendarRepository,
  ) {}

  async execute(command: DeleteCalendarEventCommand): Promise<void> {
    await resolveCalendarEventForCaller(
      this.workspacesRepository,
      this.calendarRepository,
      command.userId,
      command.eventId,
    );
    await this.calendarReposi