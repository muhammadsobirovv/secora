import type {
  BugBountyCalendarEvent,
  CalendarEventType,
} from '../../../../prisma-types.js';

export interface ListCalendarEventsFilter {
  workspaceId: string;
  from?: Date;
  to?: Date;
  type?: CalendarEventType;
  programId?: string;
}

export interface CreateCalendarEventInput {
  workspaceId: string;
  programId?: string | null;
  reportId?: string | null;
  type: CalendarEventType;
  title: string;
  dueAt: Date;
  notes?: string | null;
  createdBy: string;
}

export type UpdateCalendarEventInput = Partial<
  Omit<
    CreateCalendarEventInput,
    'workspaceId' | 'programId' | 'reportId' | 'createdBy'
  >
> & { completedAt?: Date | null };

export interface BugBountyCalendarRepository {
  create(input: CreateCalendarEventInput): Promise<BugBountyCalendarEvent>;
  findById(id: string): Promise<BugBountyCalendarEvent | null>;
  list(filter: ListCalendarEventsFilter): Promise<BugBountyCalendarEvent[]>;
  update(
    id: string,
    input: UpdateCalendarEventInput,
  ): Promise<BugBountyCalendarEvent>;
  delete(id: string): Promise<void>;
  /// Events due within the given window and not yet completed — the
  /// notification scheduler's source query (Notifications: Report
  /// Deadlines / Reminder Notifications).
  listDueBetween(
    workspaceId: string,
    from: Date,
    to: Date,
  ): Promise<BugBountyCalendarEvent[]>;

  /// Cross-workspace by design (unlike every other method here) — this is
  /// the background BugBountyDeadlineNotifierService's source query, which
  /// runs as a system process rather than on behalf of one caller, the
  /// same way VulnScanJobsRepository.findOrphaned() operates cross-
  /// workspace for its poller. Not exposed through any user-facing
  /// query/controller.
  listDueForNotification(before: Date): Promise<BugBountyCalendarEvent[]>;
  markNotified(id: string): Promise<void>;
}

export const BUGBOUNTY_CALENDAR_REPOSITORY = Symbol(
  'BUGBOUNTY_CALENDAR_REPOSITORY',
);
