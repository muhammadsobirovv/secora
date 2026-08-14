import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  CreateUserInput,
  UsersRepository,
} from '../../../domain/repositories/users.repository.interface.js';
import type { User } from '../../../../../prisma-types.js';

@Injectable()
export class PrismaUsersRepository implements UsersRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.txHost.tx.user.findUnique({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.txHost.tx.user.findUnique({ where: { email } });
  }

  create(input: CreateUserInput): Promise<User> {
    return this.txHost.tx.user.create({ data: input });
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.txHost.tx.user.update({ where: { id }, data: { passwordHash } });
  }

  async setEmailVerified(id: string): Promise<void> {
    await this.txHost.tx.user.update({
      where: { id },
      data: { emailVerified: true },
    });
  }

  recordFailedLogin(id: string): Promise<User> {
    return this.txHost.tx.user.update({
      where: { id },
      data: { failedLoginCount: { increment: 1 } },
    });
  }

  async resetFailedLogin(id: string): Promise<void> {
    await this.txHost.tx.user.update({
      where: { id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }

  async lockUntil(id: string, until: Date): Promise<void> {
    await this.txHost.tx.user.update({
      where: { id },
      data: { lockedUntil: until, failedLoginCount: 0 },
    });
  }

  async markDeleted(id: string): Promise<void> {
    await this.txHost.tx.user.update({
      where: { id },
      data: { status: 'DELETED' },
    });
  }
}
