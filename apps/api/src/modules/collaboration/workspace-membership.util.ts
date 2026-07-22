import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { WorkspaceMemberRole } from '../../prisma-types.js';

/// Module 9's Collaboration surface is the first part of this codebase
/// that has to act on behalf of a workspace the caller doesn't
/// necessarily *own* — every prior module's authorization
/// (`resolveWorkspaceForCaller` in Modules 2/6, etc.) resolves "my
/// personal workspace" implicitly and never takes a `workspaceId` from
/// the client, because until now no user could act inside a workspace
/// they didn't create (see `WorkspacesRepository.
/// findPersonalWorkspaceForUser`'s doc comment: "no workspace-switching
/// exists yet"). Collaboration's whole point is inviting a teammate into
/// *someone else's* workspace at a role below OWNER, so its endpoints are
/// workspace-explicit: the client passes `workspaceId`, and this
/// resolver checks real `WorkspaceMember` rows instead of assuming
/// "the caller's own workspace".
///
/// This is deliberately scoped to Module 9's new endpoints only —
/// Modules 1-8 keep their existing implicit single-personal-workspace
/// resolution untouched (no rewrite), consistent with the standing "do
/// not rewrite previous modules except where integration is required"
/// constraint. A future module can migrate the rest of the app to
/// workspace-explicit routing once multi-workspace switching is a
/// first-class product surface end to end (frontend workspace switcher,
/// etc.) — that's a larger product change than Module 9's scope.
export async function resolveWorkspaceMembership(
  prisma: PrismaService,
  userId: string,
  workspaceId: string,
): Promise<{ role: WorkspaceMemberRole }> {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member) {
    throw new AppException(
      'WORKSPACE_MEMBERSHIP_NOT_FOUND',
      'You are not a member of this workspace.',
      HttpStatus.FORBIDDEN,
    );
  }
  return { role: member.role };
}
