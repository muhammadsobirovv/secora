import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ClsModule } from 'nestjs-cls';
import { CqrsModule } from '@nestjs/cqrs';
import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { validateEnv } from './config/env.validation.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PrismaService } from './prisma/prisma.service.js';
import type { PrismaClient } from './prisma-types.js';
import { ProvidersModule } from './common/providers/providers.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { ResponseInterceptor } from './common/interceptors/response.interceptor.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { RbacModule } from './modules/rbac/rbac.module.js';
import { WorkspacesModule } from './modules/workspaces/workspaces.module.js';
import { ApiKeysModule } from './modules/api-keys/api-keys.module.js';
import { UserPreferencesModule } from './modules/user-preferences/user-preferences.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { ProjectsModule } from './modules/projects/projects.module.js';
import { TargetsModule } from './modules/targets/targets.module.js';
import { NotesModule } from './modules/notes/notes.module.js';
import { EvidenceModule } from './modules/evidence/evidence.module.js';
import { AttachmentsModule } from './modules/attachments/attachments.module.js';
import { TagsModule } from './modules/tags/tags.module.js';
import { ActivityModule } from './modules/activity/activity.module.js';
import { SearchModule } from './modules/search/search.module.js';
import { ReconModule } from './modules/recon/recon.module.js';
import { VulnModule } from './modules/vuln/vuln.module.js';
import { AiModule } from './modules/ai/ai.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    // Global CommandBus/QueryBus/EventBus — feature modules just declare
    // their @CommandHandler/@QueryHandler/@EventsHandler classes as
    // providers; the CQRS explorer (registered by forRoot) discovers them
    // app-wide, no per-module CqrsModule import needed.
    CqrsModule.forRoot(),
    // Wires nestjs-cls's transactional plugin so `@Transactional()` on a
    // use-case method opens one Prisma transaction that every repository
    // call within it participates in transparently (see PrismaModule).
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
      plugins: [
        new ClsPluginTransactional({
          imports: [PrismaModule],
          // Explicitly parameterized with our generated PrismaClient type
          // (not @prisma/client's default) — see prisma-transaction.types.ts.
          adapter: new TransactionalAdapterPrisma<PrismaClient>({
            prismaInjectionToken: PrismaService,
            // Prisma's own default interactive-transaction timeout (5s) is
            // tight for handlers doing several real writes inside one
            // transaction (e.g. Recon's persistToolResult(): a finding
            // upsert batch + an Evidence create + a status update). 15s
            // gives realistic headroom without masking a genuinely
            // runaway transaction (still bounded, not infinite).
            defaultTxOptions: { timeout: 15_000 },
          }),
        }),
      ],
    }),
    // Modest global default; individual auth routes override with a
    // stricter @Throttle(...) (see auth.module.ts once built).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    ProvidersModule,
    AuditModule,
    RbacModule,
    WorkspacesModule,
    ApiKeysModule,
    UserPreferencesModule,
    AuthModule,
    ProjectsModule,
    TargetsModule,
    NotesModule,
    EvidenceModule,
    AttachmentsModule,
    TagsModule,
    ActivityModule,
    SearchModule,
    ReconModule,
    VulnModule,
    AiModule,
  ],
  providers: [
    // Order matters: throttle first, then authenticate, then authorize.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
