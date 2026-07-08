import { describe, expect, it, jest } from '@jest/globals';
import { MfaDisableUseCase } from './mfa-disable.use-case.js';
import type { MfaRepository } from '../domain/repositories/mfa.repository.interface.js';
import type { TokenService } from '../services/token.service.js';
import type { TotpService } from '../services/totp.service.js';
import type { AuditService } from '../../audit/audit.service.js';
import type { MfaFactor } from '../../../prisma-types.js';

describe('MfaDisableUseCase', () => {
  const baseInput = {
    code: '123456',
    userId: 'user-1',
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
  };
  const enabledFactor = {
    id: 'factor-1',
    secret: 'SECRET',
    enabled: true,
  } as MfaFactor;

  function buildUseCase(overrides?: {
    factor?: MfaFactor | null;
    totpValid?: boolean;
    backupCode?: unknown;
  }) {
    const mfaRepository: jest.Mocked<MfaRepository> = {
      findFactorByUserId: jest
        .fn<MfaRepository['findFactorByUserId']>()
        .mockResolvedValue(
          overrides?.factor === undefined ? enabledFactor : overrides.factor,
        ),
      createFactor: jest.fn(),
      confirmFactor: jest.fn(),
      deleteFactor: jest.fn(),
      replaceBackupCodes: jest.fn(),
      findUnusedBackupCodeByHash: jest
        .fn<MfaRepository['findUnusedBackupCodeByHash']>()
        .mockResolvedValue((overrides?.backupCode ?? null) as never),
      consumeBackupCode: jest.fn(),
      createChallengeToken: jest.fn(),
      findValidChallengeTokenByHash: jest.fn(),
      consumeChallengeToken: jest.fn(),
    };
    const tokenService = {
      hashOpaqueToken: jest.fn().mockReturnValue('hashed'),
    } as unknown as jest.Mocked<TokenService>;
    const totpService = {
      verifyCode: jest
        .fn<TotpService['verifyCode']>()
        .mockResolvedValue(overrides?.totpValid ?? true),
    } as unknown as jest.Mocked<TotpService>;
    const auditService = {
      log: jest.fn(),
    } as unknown as jest.Mocked<AuditService>;

    const useCase = new MfaDisableUseCase(
      mfaRepository,
      tokenService,
      totpService,
      auditService,
    );
    return { useCase, mfaRepository, auditService };
  }

  it('deletes the factor on a valid TOTP code', async () => {
    const deps = buildUseCase();

    await deps.useCase.execute(baseInput);

    expect(deps.mfaRepository.deleteFactor).toHaveBeenCalledWith('factor-1');
    expect(deps.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'MFA_DISABLED' }),
    );
  });

  it('accepts a valid backup code as an alternative to the TOTP code', async () => {
    const deps = buildUseCase({
      totpValid: false,
      backupCode: { id: 'backup-1' },
    });

    await deps.useCase.execute(baseInput);

    expect(deps.mfaRepository.deleteFactor).toHaveBeenCalledWith('factor-1');
  });

  it("rejects when MFA isn't enabled", async () => {
    const deps = buildUseCase({ factor: null });

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'MFA_NOT_ENABLED',
    });
  });

  it('rejects an invalid code', async () => {
    const deps = buildUseCase({ totpValid: false, backupCode: null });

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'MFA_CODE_INVALID',
    });
    expect(deps.mfaRepository.deleteFactor).not.toHaveBeenCalled();
  });
});
