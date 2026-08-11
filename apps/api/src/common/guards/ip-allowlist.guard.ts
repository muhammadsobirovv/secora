import { CanActivate, ExecutionContext, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { EnvConfig } from '../../config/env.validation.js';
import { AppException } from '../exceptions/app.exception.js';
import { isIpAllowlisted, parseAllowlist } from './ip-allowlist.util.js';

const securityLogger = new Logger('Security');

/// Module 14 — Security: IP Allow Lists. Registered globally, first in
/// the guard chain after throttling — rejects before any auth/DB work
/// happens for a request from outside the configured ranges. A no-op
/// (every request passes) when `IP_ALLOWLIST` is unset, which is the
/// default — Community Edition and any deployment that hasn't opted in
/// never sees this guard do anything. Relies on `req.ip`, which is only
/// trustworthy when `TRUST_PROXY_HOPS` is configured correctly for the
/// deployment's actual reverse-proxy topology (see that var's doc
/// comment) — the same caveat every IP-based control in this codebase
/// (audit logging, throttling) already carries.
@Injectable()
export class IpAllowlistGuard implements CanActivate {
  private readonly entries: string[];

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {
    this.entries = parseAllowlist(this.configService.get('IP_ALLOWLIST', { infer: true }));
  }

  canActivate(context: ExecutionContext): boolean {
    if (this.entries.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    if (!isIpAllowlisted(request.ip ?? '', this.entries)) {
      // Module 14 — Security Logs: a structured, greppable record of
      // every rejected request, independent of (and faster to check
      // than) querying the `AuditEvent` table — this guard runs before
      // authentication, so there's no `userId` yet to attach an
      // AuditEvent to in the first place.
      securityLogger.warn('Request rejected: IP not allowlisted', {
        ip: request.ip,
        path: request.path,
        method: request.method,
      });
      throw new AppException(
        'IP_NOT_ALLOWLISTED',
        'Your network address is not permitted to access this deployment.',
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}
