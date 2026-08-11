import { CanActivate, ExecutionContext, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { EnvConfig } from '../../config/env.validation.js';
import { AppException } from '../exceptions/app.exception.js';

const securityLogger = new Logger('Security');

/// Module 14 — Security: Mutual TLS. Registered globally, immediately
/// after `IpAllowlistGuard` — both are coarse, cheap, pre-authentication
/// network-layer checks. Mutual TLS itself is terminated by the reverse
/// proxy/ingress (nginx, Traefik, a cloud load balancer) in every
/// deployment topology this platform documents — the Node process never
/// holds a private key or negotiates a TLS handshake directly. This
/// guard does not (and cannot) perform the TLS handshake; it only
/// enforces that, when `MTLS_REQUIRED=true`, every request already
/// carries proof the proxy verified a client certificate before
/// forwarding it — defense in depth against a misconfigured proxy that
/// terminates TLS but forgets to enforce `ssl_verify_client` (or the
/// ingress-controller equivalent) and forwards unverified traffic
/// straight through.
///
/// A no-op (every request passes) when `MTLS_REQUIRED` is unset, which
/// is the default — Community Edition and any deployment that hasn't
/// opted into mTLS never sees this guard do anything. See
/// `docs/security/tls-mtls-certificates.md` for how to configure the
/// proxy side (nginx `ssl_verify_client on`, the ingress-nginx
/// `nginx.ingress.kubernetes.io/auth-tls-verify-client` annotation,
/// etc.) to actually set `MTLS_CLIENT_CERT_VERIFY_HEADER`.
@Injectable()
export class MtlsGuard implements CanActivate {
  private readonly required: boolean;
  private readonly headerName: string;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {
    this.required = this.configService.get('MTLS_REQUIRED', { infer: true });
    this.headerName = this.configService.get('MTLS_CLIENT_CERT_VERIFY_HEADER', { infer: true }).toLowerCase();
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.required) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    const verifyHeader = request.headers[this.headerName];
    // Express lower-cases header names; the proxy's verify header value is
    // implementation-specific (nginx's $ssl_client_verify emits "SUCCESS"
    // on a verified cert), so this only checks presence/non-empty rather
    // than a specific literal — the proxy config, not this guard, decides
    // what counts as verified.
    const isVerified = typeof verifyHeader === 'string' && verifyHeader.length > 0;
    if (!isVerified) {
      securityLogger.warn('Request rejected: mTLS client certificate not verified', {
        ip: request.ip,
        path: request.path,
        method: request.method,
        expectedHeader: this.headerName,
      });
      throw new AppException(
        'MTLS_CLIENT_CERT_NOT_VERIFIED',
        'This deployment requires a verified mutual TLS client certificate.',
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}
