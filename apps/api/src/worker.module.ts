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

/// The worker process's own root module — deliberately NOT AppModule.
/// No HTTP guards/filters/interceptors (ThrottlerGuard, JwtAuthGuard,
/// RolesGuard, exception filter, response interceptor — all meaningless
/// with no HTTP server), no AuthModule/RbacModule/AuditModule/
/// ApiKeysModule/UserPreferencesModule (nothing in the recon execution
/// path touches them). Mirrors AppModule's infrastructure wiring
/// (Config/Cls-transactional/Prisma/Providers) because this is a
/// genuinely separate NestFactory.createApplicationContext() root with
/// its own DI container — @Global() modules in AppModule's tree don't
/// reach this one. Imports ActivityModule directly (a second instance,
/// in a second OS process) because @nestjs/cqrs's EventBus doesn't cross
/// process boundaries — see docs/adr/0003-recon-engine-module.md.
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
  ],
})
export class WorkerModule {}
