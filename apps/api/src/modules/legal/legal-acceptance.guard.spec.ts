import { jest } from '@jest/globals';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { LegalAcceptanceGuard } from './legal-acceptance.guard.js';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';
import { ALLOW_WITHOUT_LEGAL_ACCEPTANCE_KEY } from '../../common/decorators/allow-without-legal-acceptance.decorator.js';
import type { LegalService } from './legal.service.js';

function httpContext(
  user: { id: string } | undefined,
  metadata: Record<string, boolean> = {},
) {
  const handler = () => undefined;
  for (const [key, value] of Object.entries(metadata)) {
    Reflect.defineMetadata(key, value, handler);
  }
  return {
    getHandler: () => handler,
    getClass: () => class {},
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function buildGuard(accepted: boolean) {
  const legalService = {
    hasAcceptedCurrentVersion: jest.fn(() => Promise.resolve(accepted)),
  } as unknown as jest.Mocked<LegalService>;
  return {
    guard: new LegalAcceptanceGuard(new Reflector(), legalService),
    legalService,
  };
}

describe('LegalAcceptanceGuard', () => {
  it('returns 403 LEGAL_ACCEPTANCE_REQUIRED for an authenticated user who has not accepted', async () => {
    const { guard } = buildGuard(false);

    await expect(
      guard.canActivate(httpContext({ id: 'user-1' })),
    ).rejects.toMatchObject({
      code: 'LEGAL_ACCEPTANCE_REQUIRED',
      status: 403,
    });
  });

  it('lets an authenticated user through once the current version is accepted', async () => {
    const { guard } = buildGuard(true);

    await expect(
      guard.canActivate(httpContext({ id: 'user-1' })),
    ).resolves.toBe(true);
  });

  it('does not gate @Public() routes or routes exempted for acceptance', async () => {
    const { guard, legalService } = buildGuard(false);

    await expect(
      guard.canActivate(
        httpContext({ id: 'user-1' }, { [IS_PUBLIC_KEY]: true }),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        httpContext(
          { id: 'user-1' },
          { [ALLOW_WITHOUT_LEGAL_ACCEPTANCE_KEY]: true },
        ),
      ),
    ).resolves.toBe(true);
    expect(legalService.hasAcceptedCurrentVersion).not.toHaveBeenCalled();
  });
});
