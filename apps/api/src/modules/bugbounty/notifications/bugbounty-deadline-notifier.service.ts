import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation.js';
import {
  BUGBOUNTY_CALENDAR_REPOSITORY,
  type BugBountyCalendarRepository,
} from '../domain/repositories/bugbounty-calendar.repository.interface.js';
import {
  BUGBOUNTY_NOTIFICATIONS_REPOSITORY,
  type BugBountyNotificationsRepository,
} from '../domain/repositories/bugbounty-notifications.repository.interface.js';

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
      await this.notificationsRepository.create({
        workspaceId: event.workspaceId,
        userId: event.createdBy,
        type:
          event.type === 'SUBMISSION_DEADLINE' ? 'REPORT_DEADLINE' : 'REMINDER',
        title: isOverdue
          ? `Overdue: ${event.title}`
          : `Upcoming: ${event.title}`,
        body: `Due ${event.dueAt.toISOString()}${event.notes ? ` — ${event.notes}` : ''}`,
        relatedEntityType: 'BugBountyCalendarEvent',
        relatedEntityId: event.id,
      });
      await this.calendarRepository.markNotified(event.i