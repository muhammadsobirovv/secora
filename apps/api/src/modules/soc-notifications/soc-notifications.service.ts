import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../workspaces/domain/repositories/workspaces.repository.interface.js';
import { NotificationDispatcherService } from '../notifications-channels/services/notification-dispatcher.service.js';

interface NotificationRow {
  id: string;
  workspaceId: string;
  userId: string;
}

/// Module 17 — task #482 (Notification engine extensions).
///
/// The existing multi-channel notification engine (Module 6/9/15 —
/// `BugBountyNotification` + `NotificationChannelConfig` +
/// `NotificationDispatcherService`) already handles storage, per-channel
/// delivery, and read-tracking; nothing here duplicates that. What was
/// missing for SOC events specifically was recipient resolution: every
/// existing notification-creation call site (deadline poller, AI budget
/// enforcer, an automation rule's NOTIFY action) already has a concrete
/// `userId` in hand — either from the row being processed or from a rule
/// a human configured with `actionConfig.userId`. SOC domain events
/// (`IncidentCreatedEvent`, `SlaBreachedEvent`, `IndicatorMatchedEvent`)
/// only carry `workspaceId`, so a baseline SOC notification needs a
/// `workspaceId -> userId[]` resolution step that didn't exist yet —
/// that's what `notifyWorkspace` below adds, via `WorkspacesRepository
/// .listMembers`.
///
/// Deliberately unconditional (not gated behind an `AutomationRule`):
/// automation rules (task #487) are opt-in, human-authored, and cover
/// arbitrary trigger/condition/action combinations including NOTIFY —
/// but a SOC platform should raise a baseline "an incident/breach/match
/// happened" notification even for a workspace with zero automation
/// rules configured. The two are complementary, not competing: this
/// module answers "did something happen", automation rules answer "and
/// should X also happen as a result".
///
/// Recipients are every member with role OWNER or ADMIN (falling back to
/// every member if a workspace somehow has neither, so a notification is
/// never silently dropped for lack of a matching role) — see
/// `WorkspaceMemberRole`. Every personal workspace today has exactly one
/// member (its creator, added as OWNER at registration — see
/// `WorkspacesRepository`'s own doc comment), so in practice this
/// resolves to "the workspace's owner" without hard-coding that
/// assumption in a way that would break once multi-member workspaces are
/// exercised more broadly.
///
/// Notification rows are created via the same direct-Prisma-cast pattern
/// `AutomationRulesService`'s NOTIFY action already uses (not through
/// `BugBountyNotificationsRepository`, which lives in `BugBountyModule`
/// and would pull an unrelated domain module in as a dependency just for
/// this) — see that service's `executeRule` for the precedent.
@Injectable()
export class SocNotificationService {
  private readonly logger = new Logger(SocNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    private readonly dispatcher: NotificationDispatcherService,
  ) {}

  private get notificationTable() {
    return (
      this.prisma as unknown as {
        bugBountyNotification: {
          create: (args: unknown) => Promise<NotificationRow>;
        };
      }
    ).bugBountyNotification;
  }

  /// Best-effort, per-recipient: one recipient's failed create/dispatch
  /// must never prevent another recipient in the same workspace from
  /// being notified, and a total failure here must never propagate back
  /// to the caller (every subscriber in handlers/ already wraps its own
  /// call in try/catch too — this is defense in depth, not a
  /// substitute).
  async notifyWorkspace(
    workspaceId: string,
    type: string,
    title: string,
    body: string | null,
    relatedEntityType: string | null = null,
    relatedEntityId: string | null = null,
  ): Promise<void> {
    const members = await this.workspacesRepository.listMembers(workspaceId);
    const recipients = members.filter((m) => m.role === 'OWNER' || m.role === 'ADMIN');
    const targets = recipients.length > 0 ? recipients : members;

    for (const member of targets) {
      try {
        const notification = await this.notificationTable.create({
          data: { workspaceId, userId: member.userId, type, title, body, relatedEntityType, relatedEntityId },
        });
        await this.dispatcher.dispatch(notification.id, workspaceId, member.userId, title, body);
      } catch (error: unknown) {
        this.logger.warn(
          `Failed to notify user ${member.userId} in workspace ${workspaceId} (type=${type}): ${String(error)}`,
        );
      }
    }
  }
}
