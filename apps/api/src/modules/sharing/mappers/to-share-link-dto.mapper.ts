import type { ShareLinkDto } from '@pentesthub/shared';
import type { ShareLink } from '../../../prisma-types.js';

/// `rawToken` is only ever non-null immediately after creation (the one
/// moment the plaintext bearer token exists outside of the caller's own
/// memory) — every other call site passes `null`, which renders as a
/// masked preview (`tokenPrefix` + "…") so a management/list view can
/// still show *which* link is which without ever re-exposing a value
/// that could be replayed. This mirrors `CreateApiKeyResultDto`'s
/// reveal-once `rawKey` field for the exact same reason (see
/// api-keys.commands.ts).
export function toShareLinkDto(shareLink: ShareLink, rawToken: string | null): ShareLinkDto {
  return {
    id: shareLink.id,
    resourceType: shareLink.resourceType,
    resourceId: shareLink.resourceId,
    token: rawToken ?? `${shareLink.tokenPrefix}…`,
    hasPassword: shareLink.passwordHash != null,
    permission: shareLink.permission,
    expiresAt: shareLink.expiresAt ? shareLink.expiresAt.toISOString() : null,
    revokedAt: shareLink.revokedAt ? shareLink.revokedAt.toISOString() : null,
    createdAt: shareLink.createdAt.toISOString(),
    lastAccessedAt: shareLink.lastAccessedAt ? shareLink.lastAccessedAt.toISOString() : null,
    accessCount: shareLink.accessCount,
  };
}
