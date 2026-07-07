import type {
  MfaBackupCode,
  MfaChallengeToken,
  MfaFactor,
} from '../../../../prisma-types.js';

/// Covers MfaFactor + MfaBackupCode + MfaChallengeToken as one aggregate —
/// a user's MFA configuration and the ephemeral tokens tied to it.
export interface MfaRepository {
  findFactorByUserId(userId: string): Promise<MfaFactor | null>;
  createFactor(userId: string, secret: string): Promise<MfaFactor>;
  confirmFactor(id: string): Promise<void>;
  /// Disable deletes the factor (and cascades its backup codes) rather than
  /// flipping enabled=false, so re-setup always starts from a fresh secret.
  deleteFactor(id: string): Promise<void>;
  replaceBackupCodes(mfaFactorId: string, hashedCodes: string[]): Promise<void>;
  findUnusedBackupCodeByHash(
    mfaFactorId: string,
    codeHash: string,
  ): Promise<MfaBackupCode | null>;
  consumeBackupCode(id: string): Promise<void>;
  createChallengeToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<MfaChallengeToken>;
  findValidChallengeTokenByHash(
    tokenHash: string,
  ): Promise<MfaChallengeToken | null>;
  consumeChallengeToken(id: string): Promise<void>;
}

export const MFA_REPOSITORY = Symbol('MFA_REPOSITORY');
