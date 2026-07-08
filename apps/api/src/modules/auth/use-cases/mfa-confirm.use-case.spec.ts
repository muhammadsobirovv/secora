import { describe, expect, it, jest } from '@jest/globals';
import { MfaConfirmUseCase } from './mfa-confirm.use-case.js';
import type { MfaRepository } from '../domain/repositories/mfa.repository.interface.js';
import type { TokenService } from '../services/token.service.js';
import type { TotpService } from '../services/totp.service.js';
import type { AuditService } from '../../audit/audit.service.js';
import type { MfaFactor } from '../../../prisma-types.js';

describe('MfaConfirmUseCase', () => {
  const baseInput = {
    code: '123456',
    userId: 'user-1',
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
  };
  const unconfirmedFactor = {
    id: 'factor-1',
    secret: 'SECRET',
    enabled: false,
  } as MfaFactor;

  function buildUseCase(overrides?: {
    factor?: MfaFactor | null;
    codeValid?: boolean;
  }) {
    const mfaRepository: jest.Mocked<MfaRepository> = {
      findFactorByUserId: jest
        .fn<MfaRepository['findFactorByUserId']>()
        .mockResolvedValue(
          overrides?.factor === undefined
            ? unconfirmedFactor
            : overrides.factor,
        ),
      createFactor: jest.fn(),
      confirmFactor: jest.fn(),
      deleteFactor: jest.fn(),
      replaceBackupCodes: jest.fn(),
      findUnusedBackupCodeByHash: jest.fn(),
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
        .mockResolvedValue(overrides?.codeValid ?? true),
      generateBackupCodes: jest.fn().mockReturnValue(['a1', 'b2', 'c3']),
    } as unknown as jest.Mocked<TotpService>;
    const auditService = {
      log: jest.fn(),
    } as unknown as jest.Mocked<AuditService>;

    const useCase = new MfaConfirmUseCase(
      mfaRepository,
      tokenService,
      totpService,
      auditService,
    );
    return { useCase, mfaRepository, auditService };
  }

  it('confirms the factor and returns fresh backup codes', async () => {
    const deps = buildUseCase();

    const result = await deps.useCase.execute(baseInput);

    expect(deps.mfaRepository.confirmFactor).toHaveBeenCalledWith('factor-1');
    expect(deps.mfaRepository.replaceBackupCodes).toHaveBeenCalledWith(
      'factor-1',
      ['hashed', 'hashed', 'hashed'],
    );
    expect(result).toEqual({ backupCodes: ['a1', 'b2', 'c3'] });
    expect(deps.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'MFA_ENABLED' }),
    );
  });

  it("rejects when there's no setup in progress", async () => {
    const deps = buildUseCase({ factor: null });

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'MFA_NOT_ENABLED',
    });
  });

  it('rejects when MFA is already confirmed', async () => {
    const deps = buildUseCase({
      factor: { ...unconfirmedFactor, enabled: true },
    });

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'MFA_ALREADY_ENABLED',
    });
  });

  it('rejects an invalid TOTP code', async () => {
    const deps = buildUseCase({ codeValid: false });

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'MFA_CODE_INVALID',
    });
    expect(deps.mfaRepository.confirmFactor).not.toHaveBeenCalled();
  });
});
