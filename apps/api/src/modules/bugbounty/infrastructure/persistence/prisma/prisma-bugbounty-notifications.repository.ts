import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import {
  NotificationNotFoundError,
  type BugBountyNotificationsRepository,
  type CreateNotificationInput,
} from '../../../domain/repositories/bugbounty-notifications.repository.interface.js';
import type { BugBountyNotification } from '../../../../../prisma-types.js';

@Injectable()
export class PrismaBugBountyNotificationsRepository implements BugBountyNotificationsRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  create(input: CreateNotificationInput): Promise<BugBountyNotification> {
    return this.txHost.tx.bugBountyNotification.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        relatedEntityType: input.relatedEntityType ?? null,
        relatedEntityId: input.relatedEntityId ?? null,
      },
    });
  }

  list(userId: string, unreadOnly?: boolean): Promise<BugBountyNotification[]> {
    return this.txHost.tx.bugBountyNotification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async markRead(id: string, userId: string): Promise<BugBountyNotification> {
    const result = await this.txHost.tx.bugBountyNotification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    if (result.count === 0) throw new NotificationNotFoundError(id);
    return this.txHost.tx.bugBountyNotification.findUniqueOrThrow({
      where: { id },
    });
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.txHost.tx.bugBountyNotification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.coun