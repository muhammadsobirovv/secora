import { describe, expect, it, jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import type { BugBountyCalendarRepository } from '../domain/repositories/bugbounty-calendar.repository.interface.js';
import type { BugBountyNotificationsRepository } from '../domain/repositories/bugbounty-notifications.repository.interface.js';
import type { NotificationDispatcherService } from '../../notifications-channels/services/notification-dispatcher.service.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import type { BugBountyCalendarEvent, BugBountyNotification } from '../../../prisma-types.js';
import { BugBountyDeadlineNotifierService } from './bugbounty-deadline-notifier.service.js';

/// Module 15 — task #348. First spec for this service; scoped to what
/// changed for the i18n pass (locale-aware title/body via
/// resolveLocale()/translate()) rather than re-testing the poll-loop
/// scheduling machinery, which is unchanged.
function buildEvent(overrides: Partial<BugBountyCalendarEvent> = {}): BugBountyCalendarEvent {
  return {
    id: 'event-1',
    workspaceId: 'workspace-1',
    programId: null,
    reportId: null,
    type: 'SUBMISSION_DEADLINE',
    title: 'Report submission',
    dueAt: new Date('2026-08-20T00:00:00.000Z'),
    notes: null,
    createdBy: 'user-1',
    completedAt: null,
    notifiedAt: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  } as BugBountyCalendarEvent;
}

function buildService(options: { language?: string | null; lookupThrows?: boolean } = {}) {
  const event = buildEvent();
  const calendarRepository = {
    listDueForNotification: jest.fn<() => Promise<BugBountyCalendarEvent[]>>().mockResolvedValue([event]),
    markNotified: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<BugBountyCalendarRepository>;

  const createdNotification = { id: 'notification-1' } as BugBountyNotification;
  const notificationsRepository = {
    create: jest.fn<() => Promise<BugBountyNotification>>().mockResolvedValue(createdNotification),
  } as unknown as jest.Mocked<BugBountyNotificationsRepository>;

  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'BUGBOUNTY_DEADLINE_LOOKAHEAD_HOURS') return 24;
      if (key === 'BUGBOUNTY_DEADLINE_POLL_INTERVAL_MS') return 60_000;
      return undefined;
    }),
  } as unknown as ConfigService;

  const dispatcher = {
    dispatch: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<NotificationDispatcherService>;

  const prisma = {
    userPreferences: {
      findUnique: options.lookupThrows
        ? jest.fn().mockRejectedValue(new Error('db unavailable'))
        : jest.fn().mockResolvedValue(options.language === undefined ? { language: 'en' } : { language: options.language }),
    },
  } as unknown as PrismaService;

  const service = new BugBountyDeadlineNotifierService(
    calendarRepository,
    notificationsRepository,
    configService as unknown as ConfigService<never, true>,
    dispatcher,
    prisma,
  );

  return { service, event, calendarRepository, notificationsRepository, dispatcher, prisma };
}

describe('BugBountyDeadlineNotifierService — i18n (task #348)', () => {
  it('translates an upcoming deadline into the recipient locale (Russian)', async () => {
    const { service, notificationsRepository, dispatcher } = buildService({ language: 'ru' });

    // Access the private poll body directly via the public start()/tick()
    // seam is awkward for a unit test (it self-schedules); instead call
    // the private notifyDueEvents() the way the tick loop does.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service as any).notifyDueEvents();

    expect(notificationsRepository.create).toHaveBeenCalledTimes(1);
    const createArgs = notificationsRepository.create.mock.calls[0][0];
    expect(createArgs.title).toBe('Скоро: Report submission');
    expect(createArgs.body).toBe('Срок: 2026-08-20T00:00:00.000Z');
    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      'notification-1',
      'workspace-1',
      'user-1',
      'Скоро: Report submission',
      'Срок: 2026-08-20T00:00:00.000Z',
    );
  });

  it('translates an overdue deadline with notes into Uzbek', async () => {
    const { service, event, notificationsRepository } = buildService({ language: 'uz' });
    event.dueAt = new Date(Date.now() - 60_000); // already past -> overdue
    event.notes = 'escalate to program owner';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service as any).notifyDueEvents();

    const createArgs = notificationsRepository.create.mock.calls[0][0];
    expect(createArgs.title).toBe("Muddati o'tgan: Report submission");
    expect(createArgs.body).toBe(`Muddati: ${event.dueAt.toISOString()} — escalate to program owner`);
  });

  it('falls back to English when the recipient has no stored language preference', async () => {
    const { service, notificationsRepository } = buildService({ language: null });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service as any).notifyDueEvents();

    const createArgs = notificationsRepository.create.mock.calls[0][0];
    expect(createArgs.title).toBe('Upcoming: Report submission');
  });

  it('falls back to English when the locale lookup itself fails', async () => {
    const { service, notificationsRepository } = buildService({ lookupThrows: true });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service as any).notifyDueEvents();

    const createArgs = notificationsRepository.create.mock.calls[0][0];
    expect(createArgs.title).toBe('Upcoming: Report submission');
  });
});
