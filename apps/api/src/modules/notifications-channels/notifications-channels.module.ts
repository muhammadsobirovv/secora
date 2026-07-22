import { Module } from '@nestjs/common';
import {
  CreateNotificationChannelConfigHandler,
  DeleteNotificationChannelConfigHandler,
  TestNotificationChannelConfigHandler,
  UpdateNotificationChannelConfigHandler,
} from './commands/notification-channel-configs.commands.js';
import { ListNotificationChannelConfigsHandler } from './queries/notification-channel-configs.query.js';
import { NotificationDispatcherService } from './services/notification-dispatcher.service.js';
import { NotificationChannelsController } from './controllers/notification-channels.controller.js';

/// Module 9's multi-channel Notifications surface — Desktop/Browser/
/// Email/Webhook/Discord/Slack/Telegram/Custom API, layered on top of
/// Module 6's existing `BugBountyNotification` (the notification's
/// *content*, unchanged) via `NotificationDispatcherService` (the
/// notification's *delivery*, new). Exported so `BugBountyModule`'s
/// existing notification-creation command can inject
/// `NotificationDispatcherService` to fan a new notification out to
/// configured channels — see docs/adr/0009's integration note for why
/// that one-line addition to Module 6 is the single "integration
/// required" touch point, not a rewrite.
@Module({
  controllers: [NotificationChannelsController],
  providers: [
    CreateNotificationChannelConfigHandler,
    UpdateNotificationChannelConfigHandler,
    DeleteNotificationChannelConfigHandler,
    TestNotificationChannelConfigHandler,
    ListNotificationChannelConfigsHandler,
    NotificationDispatcherService,
  ],
  exports: [NotificationDispatcherService],
})
export class NotificationsChannelsModule {}
