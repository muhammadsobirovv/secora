import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';
import { ALLOW_WITHOUT_LEGAL_ACCEPTANCE_KEY } from '../../common/decorators/allow-without-legal-acceptance.decorator.js';
import { AppException } from '../../common/exceptions/app.exception.js';
import type { RequestUser } from '../../common/types/authenticated-request.js';
import { LegalService } from './legal.service.js';

/// Registered globally (APP_GUARD) after JwtAuthGuard and RolesGuard.
/// Every authenticated route answers 403 LEGAL_ACCEPTANCE_REQUIRED until
/// the user has accepted the current LEGAL_VERSION — enforced on the
/// server, so a client that skips the acceptance screen gets nothing.
///
/// Not gated: @Public() routes (no user), and routes marked
/// @AllowWithoutLegalAcceptance() (identity, legal status/accept, privacy
/// rights). Requests with no JWT user (e.g. public routes that do their own
/// API-key auth) are left to those routes' own checks.
@Injectable()
export class LegalAcceptanceGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly legalService: LegalService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets))
      return true;
    if (
      this.reflector.getAllAndOverride<boolean>(
        ALLOW_WITHOUT_LEGAL_ACCEPTANCE_KEY,
        targets,
      )
    ) {
      return true;
    }

    const request: { user?: RequestUser } | undefined =
      context.getType<'graphql'>() === 'graphql'
        ? GqlExecutionContext.create(context).getContext<{
            req?: { user?: RequestUser };
          }>().req
        : context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = request?.user;
    if (!user?.id) return true;

    if (await this.legalService.hasAcceptedCurrentVersion(user.id)) return true;

    throw new AppException(
      'LEGAL_ACCEPTANCE_REQUIRED',
      'Please review and accept the current Terms of Service, Acceptable Use Policy and Privacy Policy to continue.',
      HttpStatus.FORBIDDEN,
    );
  }
}
