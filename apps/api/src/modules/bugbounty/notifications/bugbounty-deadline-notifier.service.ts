import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveLocale } from '../../../common/i18n/locale.util.js';
import { translate } from '../../../common/i18n/message-catalog.js';
import {
  BUGBOUNTY_CALENDAR_REPOSITORY,
  type BugBountyCalendarRepository,
} from '../domain/repositories/bugbounty-calendar.repository.interface.js';
import {
  BUGBOUNTY_NOTIFICATIONS_REPOSITORY,
  type BugBountyNotificationsRepository,
} from '../domain/repositories/bugbounty-notifications.repository.interface.js';
import { NotificationDispatcherService } from '../../notifications-channels/services/notification-dispatcher.service.js';

/// Self-scheduling background poller — same shape as
/// VulnScanJobPollerService/ReconJobPollerService (a setTimeout loop
/// started once from main.ts, not @nestjs/schedule, which this codebase
/// doesn't use anywhere), but with no job-claiming: this is pure
/// read-due-events -> write-notification, safe to run redundantly across
/// multiple API instances since markNotified() is the dedupe guard (a
/// notification fires at most once per event even if two instances tick
/// at the same moment, barring the narrow race of both reading before
/// either writes — acceptable for a non-critical reminder, unlike the job
/// claiming Vuln/Recon do for actual scan work).
@Injectable()
export class BugBountyDeadlineNotifierService {
  private readonly logger = new Logger(BugBountyDeadlineNotifierService.name);
  private stopped = false;

  constructor(
    @Inject(BUGBOUNTY_CALENDAR_REPOSITORY)
    private readonly calendarRepository: BugBountyCalendarRepository,
    @Inject(BUGBOUNTY_NOTIFICATIONS_REPOSITORY)
    private readonly notificationsRepository: BugBountyNotificationsRepository,
    private readonly configService: ConfigService<EnvConfig, true>,
    // Module 9's one integration point into Module 6's notification path
    // (see NotificationDispatcherService's doc comment) — fans each
    // deadline notification out to the recipient's configured channels
    // after it's persisted. NotificationsChannelsModule exports this
    // service specifically so it can be injected here without either
    // module reaching into the other's internals.
    private readonly dispatcher: NotificationDispatcherService,
    // Module 15 — task #348. Used only for a best-effort, read-only
    // `userPreferences.language` lookup (see `notifyDueEvents()`) so this
    // notification's title/body can be translated into the recipient's
    // locale. Deliberately using `PrismaService` directly instead of
    // importing the whole `UserPreferencesModule` here (which also
    // registers an HTTP controller that has no business running inside
    // this worker-process application context — see worker.module.ts's
    // own doc comment on why it excludes that module).
    private readonly prisma: PrismaService,
  ) {}

  start(): void {
    this.logger.log('Bug Bounty deadline notifier started');
    void this.tick();
  }

  stop(): void {
    this.stopped = true;
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    const pollInterval = this.configService.get(
      'BUGBOUNTY_DEADLINE_POLL_INTERVAL_MS',
      { infer: true },
    );

    try {
      await this.notifyDueEvents();
    } catch (error) {
      this.logger.error('Deadline notifier tick failed', error);
    }

    setTimeout(() => void this.tick(), pollInterval);
  }

  private async notifyDueEvents(): Promise<void> {
    const lookaheadHours = this.configService.get(
      'BUGBOUNTY_DEADLINE_LOOKAHEAD_HOURS',
      { infer: true },
    );
    const cutoff = new Date(Date.now() + lookaheadHours * 60 * 60 * 1000);
    const dueEvents =
      await this.calendarRepository.listDueForNotification(cutoff);

    for (const event of dueEvents) {
      const isOverdue = event.dueAt.getTime() < Date.now();
      // Module 15 — task #348: this notification's title/body is now
      // translated into the recipient's locale via the shared
      // resolveLocale()/translate() pair (see common/i18n/), the reference
      // implementation for the platform's backend message-catalog
      // architecture. A failed/missing preference lookup falls back to
      // DEFAULT_LOCALE rather than blocking the notification.
      const locale = resolveLocale(await this.lookupRecipientLanguage(event.createdBy), null);
      const dueAt = event.dueAt.toISOString();
      const title = translate(
        isOverdue ? 'bugbounty.deadline.overdueTitle' : 'bugbounty.deadline.upcomingTitle',
        locale,
        { eventTitle: event.title },
      );
      const body = event.notes
        ? translate('bugbounty.deadline.bodyWithNotes', locale, { dueAt, notes: event.notes })
        : translate('bugbounty.deadline.body', locale, { dueAt });
      const notification = await this.notificationsRepository.create({
        workspaceId: event.workspaceId,
        userId: event.createdBy,
        type:
          event.type === 'SUBMISSION_DEADLINE' ? 'REPORT_DEADLINE' : 'REMINDER',
        title,
        body,
        relatedEntityType: 'BugBountyCalendarEvent',
        relatedEntityId: event.id,
      });
      await this.calendarRepository.markNotified(event.id);

      // Fan out to configured channels — failures here must never block
      // marking the event notified (already done above) or the loop over
      // remaining due events; a channel-delivery problem is not a reason
      // to re-notify the same deadline every poll tick.
      try {
        await this.dispatcher.dispatch(
          notification.id,
          event.workspaceId,
          event.createdBy,
          title,
          body,
        );
      } catch (error) {
        this.logger.warn(
          `Notification channel fan-out failed for event ${event.id}`,
          error,
        );
      }
    }
  }

  /// Best-effort, read-only locale lookup — a failed/missing preference row
  /// must never block a deadline notification from being sent; the caller
  /// (`resolveLocale`) already falls back to `DEFAULT_LOCALE` for a `null`
  /// return here.
  private async lookupRecipientLanguage(userId: string): Promise<string | null> {
    try {
      const prefs = await this.prisma.userPreferences.findUnique({
        where: { userId },
        select: { language: true },
      });
      return prefs?.language ?? null;
    } catch (error) {
      this.logger.warn(`Could not resolve recipient locale for user ${userId}`, error);
      return null;
    }
  }
}
