export interface ActivityEventDto {
  id: string;
  workspaceId: string;
  projectId: string | null;
  actorUserId: string | null;
  verb: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ListActivityQueryDto {
  projectId?: string;
  cursor?: string;
  limit?: number;
}
