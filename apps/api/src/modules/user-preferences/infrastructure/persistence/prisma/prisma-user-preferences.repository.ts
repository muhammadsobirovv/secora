import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type { UserPreferencesRepository } from '../../../domain/repositories/user-preferences.repository.interface.js';
import type { UserPreferences } from '../../../../../prisma-types.js';

@Injectable()
export class PrismaUserPreferencesRepository implements UserPreferencesRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  createDefault(userId: string): Promise<UserPreferences> {
    return this.txHost.tx.userPreferences.create({ data: { userId } });
  }

  findByUserId(userId: string): Promise<UserPreferences | null> {
    return this.txHost.tx.userPreferences.findUnique({ where: { userId } });
  }
}
