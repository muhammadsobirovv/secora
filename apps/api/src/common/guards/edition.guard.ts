import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Edition } from '@pentesthub/shared';
import { AppException } from '../exceptions/app.exception.js';
import { EditionService } from '../../modules/infrastructure/edition.service.js';
import { REQUIRES_EDITION_KEY } from '../decorators/requires-edition.decorator.js';

/// Registered globally (APP_GUARD), runs after RolesGuard — a no-op
/// unless a route carries `@RequiresEdition(...)`. Resolves the
/// organization to check against from `req.params.organizationId` (every
/// Enterprise-only route in this codebase is nested under
/// `/enterprise/organizations/:organizationId/...`, matching
/// `OrganizationsController`'s own convention) when present, otherwise
/// checks deployment-wide (no org scope) — see
/// `EditionService.isEnterpriseFor`.
@Injectable()
export class EditionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly editionService: EditionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredEdition = this.reflector.getAllAndOverride<Edition | undefined>(REQUIRES_EDITION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredEdition || requiredEdition === 'community') {
      return true;
    }
    const request = context.switchToHttp().getRequest<{ params?: Record<string, string> }>();
    const organizationId = request.params?.organizationId;
    const enabled = await this.editionService.isEnterpriseFor(organizationId ?? null);
    if (!enabled) {
      throw new AppException(
        'EDITION_FEATURE_UNAVAILABLE',
        'This feature requires Secora AI Enterprise Edition. See docs/adr/0014-cloud-platform-enterprise-saas-ha.md for how to enable it.',
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}
