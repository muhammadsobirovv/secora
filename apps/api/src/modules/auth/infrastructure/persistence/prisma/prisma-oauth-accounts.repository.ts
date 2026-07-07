import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  CreateOAuthAccountInput,
  OAuthAccountsRepository,
} from '../../../domain/repositories/oauth-accounts.repository.interface.js';
import type {
  OAuthAccount,
  OAuthProvider,
} from '../../../../../prisma-types.js';

@Injectable()
export class PrismaOAuthAccountsRepository implements OAuthAccountsRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  findByProviderAccount(
    provider: OAuthProvider,
    providerUserId: string,
  ): Promise<OAuthAccount | null> {
    return this.txHost.tx.oAuthAccount.findUnique({
      where: { provider_providerUserId: { provider, providerUserId } },
    });
  }

  create(input: CreateOAuthAccountInput): Promise<OAuthAccount> {
    return this.txHost.tx.oAuthAccount.create({ data: input });
  }

  findByUser(userId: string): Promise<OAuthAccount[]> {
    return this.txHost.tx.oAuthAccount.findMany({ where: { userId } });
  }
}
