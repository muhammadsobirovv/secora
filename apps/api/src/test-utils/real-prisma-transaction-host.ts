import type { TransactionHost } from '@nestjs-cls/transactional';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AppTransactionalAdapter } from '../prisma/prisma-transaction.types.js';

/// For repository adapter integration tests: a real PrismaService
/// connected to the real dev Postgres, wrapped in a minimal stub shaped
/// like TransactionHost. Repositories only ever read `.tx` off the host —
/// they don't need the full ClsModule/transactional-plugin machinery to
/// be exercised against a real database in a test.
export function createRealTransactionHost(
  prisma: PrismaService,
): TransactionHost<AppTransactionalAdapter> {
  return { tx: prisma } as unknown as TransactionHost<AppTransactionalAdapter>;
}

export { PrismaService };
