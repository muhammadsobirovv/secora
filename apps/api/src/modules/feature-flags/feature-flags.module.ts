import { Module } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service.js';
import { FeatureFlagsController } from './controllers/feature-flags.controller.js';
import { FEATURE_FLAGS_REPOSITORY } from './domain/repositories/feature-flags.repository.interface.js';
import { PrismaFeatureFlagsRepository } from './infrastructure/persistence/prisma/prisma-feature-flags.repository.js';

/// Module 15 — task #357. `EditionService` is not listed as an import
/// here — `InfrastructureModule` (Module 14) is `@Global()`, so it's
/// already reachable from this module's injector without redeclaring it,
/// the same pattern every other module that needs `EditionService`
/// already relies on (e.g. `EditionGuard`).
@Module({
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagsService, { provide: FEATURE_FLAGS_REPOSITORY, useClass: PrismaFeatureFlagsRepository }],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
