import { Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type {
  BugBountyNotificationDto,
  ListNotificationsQueryDto,
} from '@pentesthub/shared';
import {
  BUGBOUNTY_NOTIFICATIONS_REPOSITORY,
  type BugBountyNotificationsRepository,
} from '../domain/repositories/bugbounty-notifications.repository.interface.js';
import { toNotificationDto } from '../mappers/to-notification-dto.mapper.js';

export class ListNotificationsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly filter: ListNotificationsQueryDto,
  ) {}
}

@QueryHandler(ListNotificationsQuery)
export class ListNotificationsHandler implements IQueryHandler<
  ListNotificationsQuery,
  BugBountyNotificationDto[]
> {
  constructor(
    @Inject(BUGBOUNTY_NOTIFICATIONS_REPOSITORY)
    private readonly notificationsRepository: BugBountyNotificationsRepository,
  ) {}

  async execute(
    query: ListNotificationsQuery,
  ): Promise<BugBountyNotificationDto[]> {
    const notifications = await this.notificationsRepository.list(
      query.userId,
      query.filter.unreadOnly,
    );
    return notifications.map(toNotificationDto);
  }
}
