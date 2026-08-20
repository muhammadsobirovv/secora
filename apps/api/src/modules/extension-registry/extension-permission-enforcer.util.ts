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
/// This is the enforcement point any caller must go through before
/// letting a registered extension touch platform data — it does not
/// itself invoke anything, it only authorizes. As of the hardening pass
/// (task #454) it has a real consumer: `InvokeExtensionHandler`
/// (extension-registry.commands.ts), reached via `POST
/// /extensions/:id/invoke`. That handler is a generic, uniform HTTP-relay
/// invocation path suitable for any `ExtensionType`; a deeper, per-type
/// integration (feeding a RECON_PROVIDER extension straight into
/// `ToolRunner`, a WORKFLOW_NODE into the Workflow engine, an AI_AGENT
/// into the Agent framework, etc.) remains future work and is not implied
/// by this comment.
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
