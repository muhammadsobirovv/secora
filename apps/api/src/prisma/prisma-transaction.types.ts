import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { PrismaClient } from '../prisma-types.js';

// TransactionalAdapterPrisma<TClient = @prisma/client's PrismaClient> defaults
// to the classic package, not our custom-generated client (schema.prisma's
// `output` points elsewhere) — left unparameterized, `$transaction`'s
// signature can't be extracted correctly and TransactionHost#tx collapses to
// `any`. Every repository imports this alias instead of the bare adapter
// type so `tx.user`, `tx.session`, etc. stay properly typed.
export type AppTransactionalAdapter = TransactionalAdapterPrisma<PrismaClient>;
