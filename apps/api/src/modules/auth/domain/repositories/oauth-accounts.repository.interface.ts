import type { OAuthAccount, OAuthProvider } from '../../../../prisma-types.js';

export interface CreateOAuthAccountInput {
  userId: string;
  provider: OAuthProvider;
  providerUserId: string;
  accessToken?: string;
  refreshToken?: string;
}

export interface OAuthAccountsRepository {
  findByProviderAccount(
    provider: OAuthProvider,
    providerUserId: string,
  ): Promise<OAuthAccount | null>;
  create(input: CreateOAuthAccountInput): Promise<OAuthAccount>;
  findByUser(userId: string): Promise<OAuthAccount[]>;
}

export const OAUTH_ACCOUNTS_REPOSITORY = Symbol('OAUTH_ACCOUNTS_REPOSITORY');
