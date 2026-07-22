import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClsModule } from 'nestjs-cls';
import { CqrsModule } from '@nestjs/cqrs';
import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { validateEnv } from './config/env.validation.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PrismaService } from './prisma/prisma.service.js';
import type { PrismaClient } from './prisma-types.js';
import { ProvidersModule } from './common/providers/providers.module.js';
import { ActivityModule } from './modules/activity/activity.module.js';
import { ReconCoreModule } from './modules/recon/recon-core.module.js';
import { VulnCoreModule } from './modules/vuln/vuln-core.module.js';
import { AiCoreModule } from './modules/ai/ai-core.module.js';
import { BugBountyCoreModule } from './modules/bugbounty/bugbounty-core.module.js';
import { BugBountyDeadlineNotifierService } from './modules/bugbounty/notifications/bugbounty-deadline-notifier.service.js';
import { WorkerReaperService } from './modules/distributed-jobs/services/worker-reaper.service.js';

/// The worker process's own root module — deliberately NOT AppModule.
/// No HTTP guards/filters/interceptors (ThrottlerGuard, JwtAuthGuard,
/// RolesGuard, exception filter, response interceptor — all meaningless
/// with no HTTP server), no AuthModule/RbacModule/AuditModule/
/// ApiKeysModule/UserPreferencesModule (nothing in the recon/vuln
/// execution paths touch them). Mirrors AppModule's infrastructure wiring
/// (Config/Cls-transactional/Prisma/Providers) because this is a
/// genuinely separate NestFactory.createApplicationContext() root with
/// its own DI container — @Global() modules in AppModule's tree don't
/// reach this one. Imports ActivityModule directly (a second instance,
/// in a second OS process) because @nestjs/cqrs's EventBus doesn't cross
/// process boundaries — see docs/adr/0003-recon-engine-module.md.
///
/// One OS process runs both pollers (ReconJobPollerService and
/// VulnScanJobPollerService — see worker.main.ts): Module 4 deliberately
/// did not introduce a second worker binary/deployment unit. Each
/// module's own poll loop, concurrency cap, and claim query are still
/// fully independent (they claim from different tables); "one process,
/// two independent loops" is simpler to deploy than "one process per
/// module" while preserving the same "controllers only enqueue, workers
/// execute" separation from the API process.
///
/// Module 5 adds AiCoreModule here for the same cross-process-EventBus
/// reason as ActivityModule: AiSummaryHandler (Event Integration) listens
/// for ReconJobCompletedEvent/VulnFinding*Event, which are published from
/// inside this worker process's own execution services, not from the API
/// process — a second AiSummaryHandler instance living only in AppModule
/// would never see them.
///
/// Module 6 adds BugBountyCoreModule for BugBountyDeadlineNotifierService's
/// repository dependencies (BUGBOUNTY_CALENDAR_REPOSITORY,
/// BUGBOUNTY_NOTIFICATIONS_REPOSITORY) and registers the notifier itself as
/// a provider here — it's a third self-scheduling poller started from
/// worker.main.ts, following the exact same pattern as the Recon/Vuln
/// pollers. It doesn't publish domain events consumed elsewhere in this
/// process, but it lives in the worker process (not the API process) for
/// the same reason the other pollers do: controllers only enqueue/read,
/// background execution happens here.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    CqrsModule.forRoot(),
    ClsModule.forRoot({
      global: true,
      plugins: [
        new ClsPluginTransactional({
          imports: [PrismaModule],
          adapter: new TransactionalAdapterPrisma<PrismaClient>({
            prismaInjectionToken: PrismaService,
            // Same reasoning as AppModule's identical config — see the
            // comment there. persistToolResult() (Evidence creation +
            // finding upserts) is exactly the kind of I/O-inside-a-
            // transaction work Prisma's 5s default is tight for.
            defaultTxOptions: { timeout: 15_000 },
          }),
        }),
      ],
    }),
    PrismaModule,
    ProvidersModule,
    ActivityModule,
    ReconCoreModule,
    VulnCoreModule,
    AiCoreModule,
    BugBountyCoreModule,
  ],
  // Module 10 adds WorkerReaperService — dead-worker recovery + job
  // migration for the Distributed Job System, a fourth self-scheduling
  // poller alongside Recon/Vuln/BugBounty-deadlines, following the exact
  // same start()/stop() lifecycle as the other three.
  providers: [BugBountyDeadlineNotifierService, WorkerReaperService],
  exports: [BugBountyDeadlineNotifierService, WorkerReaperService],
})
export class WorkerModule {}
