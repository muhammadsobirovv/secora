import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type {
  AcceptWorkspaceInviteRequestDto,
  CreateWorkspaceInviteRequestDto,
  UpdateWorkspaceMemberRoleRequestDto,
  WorkspaceInviteDto,
} from '@pentesthub/shared';
import type { AuditEventType } from '../../../prisma-types.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveWorkspaceMembership } from '../workspace-membership.util.js';
import { requireCanGrantRole, requireRole } from '../permissions.util.js';
import { toWorkspaceInviteDto } from '../mappers/to-invite-dto.mapper.js';

// ---------------------------------------------------------------------------
// Create invite
// ---------------------------------------------------------------------------

export class CreateWorkspaceInviteCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly data: CreateWorkspaceInviteRequestDto,
  ) {}
}

@CommandHandler(CreateWorkspaceInviteCommand)
export class CreateWorkspaceInviteHandler
  implements ICommandHandler<CreateWorkspaceInviteCommand, WorkspaceInviteDto>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateWorkspaceInviteCommand): Promise<WorkspaceInviteDto> {
    const { role: actingRole } = await resolveWorkspaceMembership(
      this.prisma,
      command.userId,
      command.workspaceId,
    );
    // Inviting requires ADMIN+ (owners/admins manage membership); the
    // acting member additionally can't grant a role above their own.
    requireRole(actingRole, 'ADMIN');
    requireCanGrantRole(actingRole, command.data.role);

    const token = randomBytes(32).toString('base64url');
    const expiresInDays = command.data.expiresInDays ?? 7;
    const invite = await this.prisma.workspaceInvite.create({
      data: {
        workspaceId: command.workspaceId,
        email: command.data.email.toLowerCase().trim(),
        role: command.data.role,
        token,
        invitedBy: command.userId,
        expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
      },
    });

    // Email delivery is intentionally not wired here — this codebase has
    // no MailerService/email-provider integration yet (grep confirms
    // none exists for any module, including Module 1's own email
    // verification flow, which is schema+token-only in the same way).
    // The invite is fully functional via the returned token (or a
    // workspace admin copy-pasting the accept URL) until a transactional
    // email provider is wired — tracked in docs/modules/09-*.md's
    // "Verification handoff" as a real, disclosed gap rather than a
    // silent one.
    const type: AuditEventType = 'WORKSPACE_MEMBER_INVITED';
    await this.prisma.auditEvent.create({
      data: {
        userId: command.userId,
        type,
        ipAddress: '0.0.0.0',
        userAgent: 'api',
        metadata: { workspaceId: command.workspaceId, inviteId: invite.id, email: invite.email, role: invite.role },
      },
    });

    return toWorkspaceInviteDto(invite);
  }
}

// ---------------------------------------------------------------------------
// Revoke invite
// ---------------------------------------------------------------------------

export class RevokeWorkspaceInviteCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly inviteId: string,
  ) {}
}

@CommandHandler(RevokeWorkspaceInviteCommand)
export class RevokeWorkspaceInviteHandler
  implements ICommandHandler<RevokeWorkspaceInviteCommand, void>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: RevokeWorkspaceInviteCommand): Promise<void> {
    const { role } = await resolveWorkspaceMembership(this.prisma, command.userId, command.workspaceId);
    requireRole(role, 'ADMIN');

    const invite = await this.prisma.workspaceInvite.findFirst({
      where: { id: command.inviteId, workspaceId: command.workspaceId },
    });
    if (!invite) {
      throw new AppException('WORKSPACE_INVITE_NOT_FOUND', 'Invite not found.', HttpStatus.NOT_FOUND);
    }
    await this.prisma.workspaceInvite.update({
      where: { id: invite.id },
      data: { status: 'REVOKED' },
    });
  }
}

// ---------------------------------------------------------------------------
// Accept invite
// ---------------------------------------------------------------------------

export class AcceptWorkspaceInviteCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly userEmail: string,
    public readonly data: AcceptWorkspaceInviteRequestDto,
  ) {}
}

@CommandHandler(AcceptWorkspaceInviteCommand)
export class AcceptWorkspaceInviteHandler
  implements ICommandHandler<AcceptWorkspaceInviteCommand, WorkspaceInviteDto>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: AcceptWorkspaceInviteCommand): Promise<WorkspaceInviteDto> {
    const invite = await this.prisma.workspaceInvite.findUnique({
      where: { token: command.data.token },
    });
    if (!invite || invite.status !== 'PENDING') {
      throw new AppException('WORKSPACE_INVITE_NOT_FOUND', 'Invite not found or already used.', HttpStatus.NOT_FOUND);
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      await this.prisma.workspaceInvite.update({ where: { id: invite.id }, data: { status: 'EXPIRED' } });
      throw new AppException('WORKSPACE_INVITE_EXPIRED', 'This invite has expired.', HttpStatus.GONE);
    }
    // The invite is bound to the email it was sent to — a logged-in user
    // with a different email can't redeem someone else's invite token
    // even if they somehow obtain it.
    if (invite.email !== command.userEmail.toLowerCase().trim()) {
      throw new AppException(
        'WORKSPACE_INVITE_EMAIL_MISMATCH',
        'This invite was sent to a different email address.',
        HttpStatus.FORBIDDEN,
      );
    }

    const [, updated] = await this.prisma.$transaction([
      this.prisma.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: command.userId } },
        create: { workspaceId: invite.workspaceId, userId: command.userId, role: invite.role },
        update: { role: invite.role },
      }),
      this.prisma.workspaceInvite.update({
        where: { id: invite.id },
        data: { status: 'ACCEPTED', acceptedByUserId: command.userId },
      }),
    ]);

    return toWorkspaceInviteDto(updated);
  }
}

// ---------------------------------------------------------------------------
// Update member role / remove member
// ---------------------------------------------------------------------------

export class UpdateWorkspaceMemberRoleCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly targetUserId: string,
    public readonly data: UpdateWorkspaceMemberRoleRequestDto,
  ) {}
}

@CommandHandler(UpdateWorkspaceMemberRoleCommand)
export class UpdateWorkspaceMemberRoleHandler
  implements ICommandHandler<UpdateWorkspaceMemberRoleCommand, void>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateWorkspaceMemberRoleCommand): Promise<void> {
    const { role: actingRole } = await resolveWorkspaceMembership(this.prisma, command.userId, command.workspaceId);
    requireRole(actingRole, 'ADMIN');
    requireCanGrantRole(actingRole, command.data.role);

    if (command.data.role !== 'OWNER') {
      const target = await this.prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: command.workspaceId, userId: command.targetUserId } },
      });
      if (target?.role === 'OWNER') {
        const ownerCount = await this.prisma.workspaceMember.count({
          where: { workspaceId: command.workspaceId, role: 'OWNER' },
        });
        if (ownerCount <= 1) {
          throw new AppException(
            'WORKSPACE_MEMBER_ROLE_CANNOT_DEMOTE_LAST_OWNER',
            'Cannot demote the workspace\'s only remaining Owner.',
            HttpStatus.CONFLICT,
          );
        }
      }
    }

    await this.prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId: command.workspaceId, userId: command.targetUserId } },
      data: { role: command.data.role },
    });

    const type: AuditEventType = 'WORKSPACE_MEMBER_ROLE_CHANGED';
    await this.prisma.auditEvent.create({
      data: {
        userId: command.userId,
        type,
        ipAddress: '0.0.0.0',
        userAgent: 'api',
        metadata: { workspaceId: command.workspaceId, targetUserId: command.targetUserId, newRole: command.data.role },
      },
    });
  }
}

export class RemoveWorkspaceMemberCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly targetUserId: string,
  ) {}
}

@CommandHandler(RemoveWorkspaceMemberCommand)
export class RemoveWorkspaceMemberHandler implements ICommandHandler<RemoveWorkspaceMemberCommand, void> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: RemoveWorkspaceMemberCommand): Promise<void> {
    const { role: actingRole } = await resolveWorkspaceMembership(this.prisma, command.userId, command.workspaceId);
    requireRole(actingRole, 'ADMIN');

    await this.prisma.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId: command.workspaceId, userId: command.targetUserId } },
    });

    const type: AuditEventType = 'WORKSPACE_MEMBER_REMOVED';
    await this.prisma.auditEvent.create({
      data: {
        userId: command.userId,
        type,
        ipAddress: '0.0.0.0',
        userAgent: 'api',
        metadata: { workspaceId: command.workspaceId, targetUserId: command.targetUserId },
      },
    });
  }
}
