import 'dotenv/config';
import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import type { EnvConfig } from '../config/env.validation.js';

/// A real PrismaService connected to the real dev Postgres — for
/// repository adapter integration tests only (see test/jest-integration.json).
/// Never used by unit tests (those mock the repository interfaces).
export function createRealPrismaService(): PrismaService {
  const fakeConfigService = {
    get: () => process.env.DATABASE_URL,
  } as unknown as ConfigService<EnvConfig, true>;
  return new PrismaService(fakeConfigService);
}
