import type { WorkspaceInviteDto } from '@pentesthub/shared';
import type { WorkspaceInvite } from '../../../prisma-types.js';

export function toWorkspaceInviteDto(invite: WorkspaceInvite): WorkspaceInviteDto {
  return {
    id: invite.id,
    workspaceId: invite.workspaceId,
    email: invite.email,
    role: invite.role,
    status: invite.status,
    invitedBy: invite.invitedBy,
    expiresAt: invite.expiresAt.toISOString(),
    createdAt: invite.createdAt.toISOString(),
  };
}
