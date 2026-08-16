import { HttpStatus } from '@nestjs/common';
import type { SharePermission } from '@pentesthub/shared';
import { AppException } from '../../common/exceptions/app.exception.js';

const PERMISSION_RANK: Record<SharePermission, number> = {
  VIEW: 1,
  COMMENT: 2,
};

/// Enforces a ShareLink's permission ceiling — e.g. a VIEW-only link can
/// never be used to perform a COMMENT-level action, regardless of what
/// the caller requests. A share link is not itself a form of
/// authentication for *writing* to the workspace (there is no anonymous
/// user identity a Comment/Assignment/etc. could be authored as), so in
/// this pass `SharePermission.COMMENT` is modeled, persisted, and
/// enforced as an upper bound here, but no anonymous-write endpoint is
/// wired up to it yet — a disclosed scope decision, not an oversight;
/// see docs/releases/module-16-release-notes.md.
export function assertSharePermission(granted: SharePermission, required: SharePermission): void {
  if (PERMISSION_RANK[granted] < PERMISSION_RANK[required]) {
    throw new AppException(
      'SHARE_LINK_INSUFFICIENT_PERMISSION',
      `This share link only grants ${granted} access; ${required} is required for this action.`,
      HttpStatus.FORBIDDEN,
    );
  }
}
