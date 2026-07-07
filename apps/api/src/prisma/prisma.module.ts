import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/// Global module: PrismaService is injected only by Prisma*Repository
/// adapters (see modules/*/infrastructure/persistence/prisma) — never by
/// use-cases directly. See app.module.ts for the nestjs-cls transactional
/// plugin wiring that lets `@Transactional()` span multiple repositories.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
