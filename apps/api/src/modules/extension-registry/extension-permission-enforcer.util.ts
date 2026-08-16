import { HttpStatus, Injectable } from '@nestjs/common';
import type { ExtensionPermission } from '@pentesthub/shared';
import type { ExtensionRegistration } from '../../prisma-types.js';
import { AppException } from '../../common/exceptions/app.exception.js';

/// Module 16 — Extension API registry (task #401). "Permission
/// enforcement" per the spec: every capability an extension exercises at
/// runtime must map to a permission it declared at registration time —
/// a closed-world check against `ExtensionRegistration.permissions`, not
/// a string-matching heuristic. Also refuses to authorize anything for a
/// disabled extension, so `disable()` actually stops an extension from
/// acting rather than just hiding it from list views.
///
/// This is the enforcement point any future caller (a tool-invocation
/// path, a workflow-node executor, an AI agent runner) must go through
/// before letting a registered extension touch platform data — it does
/// not itself invoke anything, it only authorizes.
@Injectable()
export class ExtensionPermissionEnforcer {
  assertAuthorized(extension: Pick<ExtensionRegistration, 'enabled' | 'permissions' | 'id'>, required: ExtensionPermission): void {
    if (!extension.enabled) {
      throw new AppException(
        'EXTENSION_DISABLED_CANNOT_INVOKE',
        'This extension is disabled and cannot be invoked.',
        HttpStatus.FORBIDDEN,
      );
    }
    if (!extension.permissions.includes(required)) {
      throw new AppException(
        'EXTENSION_PERMISSION_NOT_DECLARED',
        `Extension has not declared the required permission: ${required}.`,
        HttpStatus.FORBIDDEN,
      );
    }
  }
}
