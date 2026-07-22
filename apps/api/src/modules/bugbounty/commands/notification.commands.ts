import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type { BugBountyNotificationDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  BUGBOUNTY_NOTIFICATIONS_REPOSITORY,
  NotificationNotFoundError,
  type BugBountyNotificationsRepository,
} from '../domain/repositories/bugbounty-notifications.repository.interface.js';
import { toNotificationDto } from '../mappers/to-notification-dto.mapper.js';

export class MarkNotificationReadCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly notificationId: string,
  ) {}
}

@CommandHandler(MarkNotificationReadCommand)
export class MarkNotificationReadHandler implements ICommandHandler<
  MarkNotificationReadCommand,
  BugBountyNotificationDto
> {
  constructor(
    @Inject(BUGBOUNTY_NOTIFICATIONS_REPOSITORY)
    private readonly notificationsRepository: BugBountyNotificationsRepository,
  ) {}

  async execute(
    command: MarkNotificationReadCommand,
  ): Promise<BugBountyNotificationDto> {
    try {
      const updated = await this.notificationsRepository.markRead(
        command.notificationId,
        command.userId,
      );
      return toNotificationDto(updated);
    } catch (error) {
      if (error instanceof NotificationNotFoundError) {
        throw new AppException(
          'BUGBOUNTY_NOTIFICATION_NOT_FOUND',
          'Notification not found.',
          HttpStatus.NOT_FOUND,
        );
      }
      throw error;
    }
  }
}

export class MarkAllNotificationsReadCommand implements ICommand {
  constructor(public readonly userId: string) {}
}

@CommandHandler(MarkAllNotificationsReadCommand)
export class MarkAllNotificationsReadHandler implements ICommandHandler<
  MarkAllNotificationsReadCommand,
  { count: number }
> {
  constructor(
    @Inject(BUGBOUNTY_NOTIFICATIONS_REPOSITORY)
    private readonly notificationsRepository: BugBountyNotificationsRepository,
  ) {}

  async execute(
    command: MarkAllNotificationsReadCommand,
  ): Promise<{ count: number }> {
    const count = await this.notificationsRepository.markAllRead(
      command.userId,
    );
    return { count };
  }
}
