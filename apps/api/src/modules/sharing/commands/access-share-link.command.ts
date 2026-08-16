import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AuditEventType } from '../../../prisma-types.js';
import type { ResolvedShareLinkDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { PasswordHasherService } from '../../auth/services/password-hasher.service.js';
import { resolveShareResource } from '../sharing-resource-resolver.util.js';

/// Resolving a share link is modeled as a *command*, not a query, even
/// though it looks read-only from the caller's side — it mutates
/// `accessCount`/`lastAccessedAt` and writes an audit event on every
/// attempt (success or failure), which the spec's "audit logging"
/// requirement calls for explicitly. Unauthenticated by design (there is
/// no workspace membership to check — the token itself, plus an optional
/// password, *is* the credential); every other command/query in this
/// codebase resolves a workspaceId and checks membership, this is the
/// one deliberate exception, matching how `ApiKeyAuthGuard` is the one
/// deliberate exception to the global JwtAuthGuard.
export class AccessShareLinkCommand implements ICommand {
  constructor(
    public readonly rawToken: string,
    public readonly password: string | undefined,
    public readonly ipAddress: string,
  ) {}
}

@CommandHandler(AccessShareLinkCommand)
export class AccessShareLinkHandler implements ICommandHandler<AccessShareLinkCommand, ResolvedShareLinkDto> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHasherService,
  ) {}

  async execute(command: AccessShareLinkCommand): Promise<ResolvedShareLinkDto> {
    const tokenHash = createHash('sha256').update(command.rawToken).digest('hex');
    const shareLink = await this.prisma.shareLink.findUnique({ where: { tokenHash } });

    // Token doesn't exist at all — generic 404, identical in shape/timing
    // profile to every other "not found" in this codebase, so an
    // attacker probing random tokens can't distinguish "wrong token"
    // from "right token, wrong password" from the response alone.
    if (!shareLink) {
      throw new AppException('SHARE_LINK_NOT_FOUND', 'This share link is invalid.', HttpStatus.NOT_FOUND);
    }

    // From here on the token itself is real, so distinguishing
    // revoked/expired/wrong-password is not an enumeration risk (the
    // caller already possesses a token that once worked) — it's just
    // honest UX, matching how `ApiKeyAuthGuard` reports "revoked" vs.
    // "expired" distinctly once the key hash itself resolves.
    if (shareLink.revokedAt) {
      await this.recordAudit(shareLink.id, shareLink.workspaceId, 'SHARE_LINK_ACCESS_DENIED', command.ipAddress, 'revoked');
      throw new AppException('SHARE_LINK_EXPIRED_OR_REVOKED', 'This share link has been revoked.', HttpStatus.GONE);
    }
    if (shareLink.expiresAt && shareLink.expiresAt.getTime() < Date.now()) {
      await this.recordAudit(shareLink.id, shareLink.workspaceId, 'SHARE_LINK_ACCESS_DENIED', command.ipAddress, 'expired');
      throw new AppException('SHARE_LINK_EXPIRED_OR_REVOKED', 'This share link has expired.', HttpStatus.GONE);
    }
    if (shareLink.passwordHash) {
      if (!command.password) {
        await this.recordAudit(shareLink.id, shareLink.workspaceId, 'SHARE_LINK_ACCESS_DENIED', command.ipAddress, 'password_required');
        throw new AppException('SHARE_LINK_PASSWORD_REQUIRED', 'This share link requires a password.', HttpStatus.UNAUTHORIZED);
      }
      if (!(await this.passwordHasher.verify(shareLink.passwordHash, command.password))) {
        await this.recordAudit(shareLink.id, shareLink.workspaceId, 'SHARE_LINK_ACCESS_DENIED', command.ipAddress, 'wrong_password');
        throw new AppException('SHARE_LINK_PASSWORD_INCORRECT', 'Incorrect password.', HttpStatus.UNAUTHORIZED);
      }
    }

    // Resolve the underlying resource fresh on every access (not cached
    // on the ShareLink row) so a resource deleted/renamed after the link
    // was created is reflected immediately, and so a resource that moved
    // to a different workspace (shouldn't normally happen, but defense
    // in depth) is re-validated every time rather than trusting stale
    // state.
    const resource = await resolveShareResource(this.prisma, shareLink.resourceType, shareLink.resourceId);
    if (resource.workspaceId !== shareLink.workspaceId) {
      // The resource no longer belongs to the workspace this link was
      // minted for — treat exactly like "not found" rather than serving
      // cross-tenant content.
      await this.recordAudit(shareLink.id, shareLink.workspaceId, 'SHARE_LINK_ACCESS_DENIED', command.ipAddress, 'resource_workspace_mismatch');
      throw new AppException('SHARE_LINK_NOT_FOUND', 'This share link is invalid.', HttpStatus.NOT_FOUND);
    }

    await this.prisma.shareLink.update({
      where: { id: shareLink.id },
      data: { accessCount: { increment: 1 }, lastAccessedAt: new Date() },
    });
    await this.recordAudit(shareLink.id, shareLink.workspaceId, 'SHARE_LINK_ACCESSED', command.ipAddress, 'ok');

    return {
      resourceType: shareLink.resourceType,
      resourceId: shareLink.resourceId,
      title: resource.title,
      permission: shareLink.permission,
    };
  }

  private async recordAudit(
    shareLinkId: string,
    workspaceId: string,
    type: AuditEventType,
    ipAddress: string,
    reason: string,
  ): Promise<void> {
    await this.prisma.auditEvent.create({
      data: { type, ipAddress, userAgent: 'public-share', metadata: { shareLinkId, workspaceId, reason } },
    });
  }
}
