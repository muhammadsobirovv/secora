import { CallHandler, ExecutionContext, HttpStatus, Injectable, NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { API_VERSION_HEADER, CURRENT_API_VERSION, SUPPORTED_API_VERSIONS } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import type { AuthenticatedRequest } from '../../../common/types/authenticated-request.js';

/// Module 15 — Public API v1 versioning layer (task #335). Registered
/// globally (`APP_INTERCEPTOR`, app.module.ts) alongside `ResponseInterceptor`
/// — every response, on every route, carries `X-API-Version`. A caller
/// MAY send the same header to pin a version explicitly; today that can
/// only ever be `"1"` (there is only one version), so this mostly exists
/// as the seam a v2 negotiates through later, not something that changes
/// behavior yet. See `packages/shared/src/api-versioning.ts`'s file
/// header for why this is a header-negotiated layer rather than a `/v1/`
/// URL rewrite of every existing route.
@Injectable()
export class ApiVersionInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<Response>();

    const requested = request.headers[API_VERSION_HEADER.toLowerCase()];
    const requestedVersion = Array.isArray(requested) ? requested[0] : requested;
    if (requestedVersion && !(SUPPORTED_API_VERSIONS as readonly string[]).includes(requestedVersion)) {
      throw new AppException(
        'API_VERSION_UNSUPPORTED',
        `API version "${requestedVersion}" is not supported. Supported versions: ${SUPPORTED_API_VERSIONS.join(', ')}.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    response.setHeader(API_VERSION_HEADER, requestedVersion ?? CURRENT_API_VERSION);
    return next.handle();
  }
}
