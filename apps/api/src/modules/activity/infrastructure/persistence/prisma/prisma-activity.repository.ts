import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  ActivityRepository,
  ListActivityFilter,
  RecordActivityInput,
} from '../../../domain/repositories/activity.repository.interface.js';
import type { ActivityEvent } from '../../../../../prisma-types.js';
import type { Prisma } from '../../../../../prisma-types.js';

@Injectable()
export class PrismaActivityRepository implements ActivityRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  record(input: RecordActivityInput): Promise<ActivityEvent> {
    return this.txHost.tx.activityEvent.create({
      data: {
        ...input,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue,
      },
    });
  }

  list(filter: ListActivityFilter): Promise<ActivityEvent[]> {
    // Cursor is an ISO createdAt timestamp, not the row id — ids are
    // random UUIDv4s here and don't sort chronologically, so an id-based
    // cursor would paginate in the wrong order.
    return this.txHost.tx.activityEvent.findMany({
      where: {
        workspaceId: filter.workspaceId,
        ...(filter.projectId ? { projectId: filter.projectId } : {}),
        ...(filter.cursor
          ? { createdAt: { lt: new Date(filter.cursor) } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: filter.limit,
    });
  }
}
