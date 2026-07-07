import type { OAuthExchangeCode } from '../../../../prisma-types.js';

export interface OAuthExchangeCodesRepository {
  create(
    userId: string,
    codeHash: string,
    expiresAt: Date,
  ): Promise<OAuthExchangeCode>;
  findValidByHash(codeHash: string): Promise<OAuthExchangeCode | null>;
  markUsed(id: string): Promise<void>;
}

export const OAUTH_EXCHANGE_CODES_REPOSITORY = Symbol(
  'OAUTH_EXCHANGE_CODES_REPOSITORY',
);
