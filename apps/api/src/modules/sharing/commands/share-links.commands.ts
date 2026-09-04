import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { AuditEventType } from '../../../prisma-types.js';
import type { CreateShareLinkRequestDto, ShareLinkDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveWorkspaceMembership } from '../../collaboration/workspace-membership.util.js';
import { PasswordHasherService } from '../../auth/services/password-hasher.service.js';
import { resolveShareResource } from '../sharing-resource-resolver.util.js';
import { toShareLinkDto } from '../mappers/to-share-link-dto.mapper.js';

const MAX_EXPIRES_IN_DAYS = 365;

/// Raw token format `shl_<32 random bytes, base64url>` — same
/// crypto-random-then-sha256-hash pattern as API keys
/// (api-keys.commands.ts's `generateRawApiKey`), reused rather than
/// reinvented. Only the hash is ever persisted (see schema.prisma's
/// `ShareLink.tokenHash` doc comment).
function generateRawShareToken(): { rawToken: string; tokenHash: string; tokenPrefix: string } {
  const rawToken = `shl_${randomBytes(32).toString('base64url')}`;
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash, tokenPrefix: rawToken.slice(0, 12) };
}

/// Deliberately no `workspaceId` on this command — matching the flat
/// `POST /share-links` route (no `:workspaceId` path segment) and the
/// same "derive workspace from the resource, never trust a
/// client-supplied id" posture as Watchers/Reactions
/// (collaboration-entity-resolver.util.ts). The caller only ever
/// supplies *what* to share; which workspace it belongs to, and whether
/// they're a member of it, is resolved and checked here.
export class CreateShareLinkCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: CreateShareLinkRequestDto,
    // Module 18 — task #518 (public sharing security audit). Previously
    // recordAudit() below hardcoded '0.0.0.0' instead of the real
    // requester IP, unlike PublicShareController's access() route (the
    // one path an outsider actually hits), which already threads
    // req.ip through correctly — an inconsistency this closes.
    public readonly ipAddress: string = '0.0.0.0',
  ) {}
}

@CommandHandler(CreateShareLinkCommand)
export class CreateShareLinkHandler implements ICommandHandler<CreateShareLinkCommand, ShareLinkDto> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHasherService,
  ) {}

  async execute(command: CreateShareLinkCommand): Promise<ShareLinkDto> {
    const resource = await resolveShareResource(this.prisma, command.data.resourceType, command.data.resourceId);
    await resolveWorkspaceMembership(this.prisma, command.userId, resource.workspaceId);

    if (
      command.data.expiresInDays != null &&
      (command.data.expiresInDays < 1 || command.data.expiresInDays > MAX_EXPIRES_IN_DAYS)
    ) {
      throw new AppException(
        'INVALID_SHARE_EXPIRY',
        `expiresInDays must be between 1 and ${MAX_EXPIRES_IN_DAYS}.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const { rawToken, tokenHash, tokenPrefix } = generateRawShareToken();
    const passwordHash = command.data.password ? await this.passwordHasher.hash(command.data.password) : null;
    const expiresAt = command.data.expiresInDays
      ? new Date(Date.now() + command.data.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const shareLink = await this.prisma.shareLink.create({
      data: {
        workspaceId: resource.workspaceId,
        resourceType: command.data.resourceType,
        resourceId: command.data.resourceId,
        tokenHash,
        tokenPrefix,
        passwordHash,
        permission: command.data.permission ?? 'VIEW',
        expiresAt,
        createdBy: command.userId,
      },
    });

    await this.recordAudit(command.userId, shareLink.id, resource.workspaceId, command.ipAddress);

    return toShareLinkDto(shareLink, rawToken);
  }

  private async recordAudit(
    userId: string,
    shareLinkId: string,
    workspaceId: string,
    ipAddress: string,
  ): Promise<void> {
    const type: AuditEventType = 'SHARE_LINK_CREATED';
    await this.prisma.auditEvent.create({
      data: { userId, type, ipAddress, userAgent: 'api', metadata: { shareLinkId, workspaceId } },
    });
  }
}

/// Same "resolve the true owner, then check membership" shape — looks up
/// the ShareLink first (by id alone) and authorizes against *its*
/// `workspaceId`, rather than accepting one from the client.
export class RevokeShareLinkCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly shareLinkId: string,
    // Module 18 — task #518. Same reasoning as CreateShareLinkCommand
    // above.
    public readonly ipAddress: string = '0.0.0.0',
  ) {}
}

@CommandHandler(RevokeShareLinkCommand)
export class RevokeShareLinkHandler implements ICommandHandler<RevokeShareLinkCommand, void> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: RevokeShareLinkCommand): Promise<void> {
    const shareLink = await this.prisma.shareLink.findUnique({ where: { id: command.shareLinkId } });
    if (!shareLink) {
      throw new AppException('SHARE_LINK_NOT_FOUND', 'Share link not found.', HttpStatus.NOT_FOUND);
    }
    await resolveWorkspaceMembership(this.prisma, command.userId, shareLink.workspaceId);

    if (shareLink.revokedAt) return; // idempotent

    await this.prisma.shareLink.update({ where: { id: shareLink.id }, data: { revokedAt: new Date() } });

    const type: AuditEventType = 'SHARE_LINK_REVOKED';
    await this.prisma.auditEvent.create({
      data: {
        userId: command.userId,
        type,
        ipAddress: command.ipAddress,
        userAgent: 'api',
        metadata: { shareLinkId: shareLink.id, workspaceId: shareLink.workspaceId },
      },
    });
  }
}
