import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { EnvConfig } from '../config/env.validation.js';
import { PrismaClient } from '../../generated/prisma/client.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  // @Inject(ConfigService) explicitly, not just the type annotation — under
  // tsx/esbuild, a constructor parameter typed as the generic
  // ConfigService<EnvConfig, true> doesn't get design:paramtypes metadata
  // emitted reliably, so Nest resolves it to undefined at runtime (see
  // jwt.strategy.ts for the fuller explanation; same root cause hit every
  // ConfigService<EnvConfig, true> injection point in this codebase).
  constructor(
    @Inject(ConfigService) configService: ConfigService<EnvConfig, true>,
  ) {
    super({
      adapter: new PrismaPg({
        connectionString: configService.get('DATABASE_URL', { infer: true }),
        // Module 10 — High Availability / Performance: see
        // DATABASE_POOL_MAX's doc comment in env.validation.ts for how to
        // size this across replicas. Passed straight through to
        // node-postgres's underlying `Pool` (`PrismaPg` forwards every
        // option it doesn't itself consume).
        max: configService.get('DATABASE_POOL_MAX', { infer: true }),
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
