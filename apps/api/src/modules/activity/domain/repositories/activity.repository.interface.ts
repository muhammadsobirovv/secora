import type { ActivityEvent } from '../../../../prisma-types.js';

export interface RecordActivityInput {
  workspaceId: string;
  projectId: string | null;
  actorUserId: string | null;
  verb: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

export interface ListActivityFilter {
  workspaceId: string;
  projectId?: string;
  cursor?: string;
  limit: number;
}

export interface ActivityRepository {
  record(input: RecordActivityInput): Promise<ActivityEvent>;
  list(filter: ListActivityFilter): Promise<ActivityEvent[]>;
}

export const ACTIVITY_REPOSITORY = Symbol('ACTIVITY_REPOSITORY');
