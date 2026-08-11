import { Global, Module } from '@nestjs/common';
import { EditionService } from './edition.service.js';
import { EditionController } from './controllers/edition.controller.js';
import { ClusterOverviewService } from './cluster-overview.service.js';
import { ClusterOverviewController } from './controllers/cluster-overview.controller.js';

/// Module 14 — Cloud Platform, Enterprise SaaS, High Availability &
/// Global Infrastructure. `@Global()` because `EditionGuard` (registered
/// as an `APP_GUARD` in `app.module.ts`, resolved from the *root*
/// injector) needs `EditionService` reachable without every feature
/// module importing this one explicitly — the same rationale
/// `ProvidersModule` already established for `STORAGE_SERVICE`/
/// `QUEUE_SERVICE`/`PollerLeaseService`. `ClusterOverviewService` (Admin
/// Console infrastructure dashboard) lives here too since it depends on
/// `EditionService` directly and belongs to the same "deployment-wide,
/// not workspace-scoped" family of concerns.
@Global()
@Module({
  controllers: [EditionController, ClusterOverviewController],
  providers: [EditionService, ClusterOverviewService],
  exports: [EditionService, ClusterOverviewService],
})
export class InfrastructureModule {}
