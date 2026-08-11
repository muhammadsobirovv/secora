import { describe, expect, it, jest } from '@jest/globals';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { EnvConfig } from '../../config/env.validation.js';
import { MtlsGuard } from './mtls.guard.js';

/// Module 14 — Security. First guard spec in this codebase (see
/// docs/architecture/ci-cd.md's disclosed test-coverage gaps) — matches
/// this codebase's existing pattern elsewhere of hand-rolled mocks
/// rather than `@nestjs/testing`'s `Test.createTestingModule` (no
/// existing guard/interceptor spec to diverge from, and every handler
/// spec in this repo already hand-rolls its dependency mocks).
function buildConfigService(overrides: Partial<Record<'MTLS_REQUIRED' | 'MTLS_CLIENT_CERT_VERIFY_HEADER', unknown>>) {
  const values: Record<string, unknown> = {
    MTLS_REQUIRED: false,
    MTLS_CLIENT_CERT_VERIFY_HEADER: 'X-Client-Cert-Verify',
    ...overrides,
  };
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService<EnvConfig, true>;
}

function buildContext(headers: Record<string, string | undefined>): ExecutionContext {
  const request = {
    headers,
    ip: '203.0.113.1',
    path: '/enterprise/organizations/org-1',
    method: 'GET',
  } as unknown as Request;
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('MtlsGuard', () => {
  it('is a no-op when MTLS_REQUIRED is false (the default)', () => {
    const guard = new MtlsGuard(buildConfigService({ MTLS_REQUIRED: false }));
    const context = buildContext({}); // no verify header at all
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows the request through when MTLS_REQUIRED is true and the proxy set a non-empty verify header', () => {
    const guard = new MtlsGuard(
      buildConfigService({ MTLS_REQUIRED: true, MTLS_CLIENT_CERT_VERIFY_HEADER: 'X-Client-Cert-Verify' }),
    );
    // Express lower-cases incoming header names — the guard itself
    // lower-cases the configured header name to match at construction
    // time, so the mock request must use the lower-cased key.
    const context = buildContext({ 'x-client-cert-verify': 'SUCCESS' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects with MTLS_CLIENT_CERT_NOT_VERIFIED when MTLS_REQUIRED is true and the header is missing', () => {
    const guard = new MtlsGuard(buildConfigService({ MTLS_REQUIRED: true }));
    const context = buildContext({});
    expect(() => guard.canActivate(context)).toThrow(
      expect.objectContaining({ code: 'MTLS_CLIENT_CERT_NOT_VERIFIED' }),
    );
  });

  it('rejects when the header is present but empty', () => {
    const guard = new MtlsGuard(buildConfigService({ MTLS_REQUIRED: true }));
    const context = buildContext({ 'x-client-cert-verify': '' });
    expect(() => guard.canActivate(context)).toThrow(
      expect.objectContaining({ code: 'MTLS_CLIENT_CERT_NOT_VERIFIED' }),
    );
  });
});
