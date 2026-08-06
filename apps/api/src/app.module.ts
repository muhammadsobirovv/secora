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
import { BugBountyModule } from './modules/bugbounty/bugbounty.module.js';
import { CollaborationModule } from './modules/collaboration/collaboration.module.js';
import { AutomationModule } from './modules/automation/automation.module.js';
import { NotificationsChannelsModule } from './modules/notifications-channels/notifications-channels.module.js';
import { PublicApiModule } from './modules/public-api/public-api.module.js';
import { EnterpriseModule } from './modules/enterprise/enterprise.module.js';
import { DistributedJobsModule } from './modules/distributed-jobs/distributed-jobs.module.js';
import { PluginsModule } from './modules/plugins/plugins.module.js';
import { IntegrationsModule } from './modules/integrations/integrations.module.js';
import { TeamWorkspaceModule } from './modules/team-workspace/team-workspace.module.js';
import { EnterpriseReportingModule } from './modules/enterprise-reporting/enterprise-reporting.module.js';
import { EnterpriseAnalyticsModule } from './modules/enterprise-analytics/enterprise-analytics.module.js';
import { GraphqlApiModule } from './modules/graphql-api/graphql-api.module.js';
import { AutomationEngineModule } from './modules/automation-engine/automation-engine.module.js';
import { ComplianceModule } from './modules/compliance/compliance.module.js';
import { ObservabilityModule } from './modules/observability/observability.module.js';
import { AgentModule } from './modules/agent/agent.module.js';
import { McpModule } from './modules/mcp/mcp.module.js';
import { AgentSdkModule } from './modules/agent-sdk/agent-sdk.module.js';
import { ScriptsModule } from './modules/scripts/scripts.module.js';
import { RelayCommandsModule } from './modules/relay-commands/relay-commands.module.js';
import { EvaluationModule } from './modules/evaluation/evaluation.module.js';
import { DeveloperPortalModule } from './modules/developer-portal/developer-portal.module.js';

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
    BugBountyModule,
    // Module 9 — Bug Bounty Operating System: Collaboration/Automation/
    // Notifications-channels/Public API. Additive-only; nothing above this
    // line was touched to make room for them.
    CollaborationModule,
    AutomationModule,
    NotificationsChannelsModule,
    PublicApiModule,
    // Module 10 — Enterprise Platform + SaaS + Global Infrastructure.
    // Additive-only; nothing above this line was touched to make room.
    EnterpriseModule,
    DistributedJobsModule,
    PluginsModule,
    IntegrationsModule,
    TeamWorkspaceModule,
    EnterpriseReportingModule,
    EnterpriseAnalyticsModule,
    GraphqlApiModule,
    AutomationEngineModule,
    ComplianceModule,
    ObservabilityModule,
    // Module 11 — AI Security Copilot + Autonomous Multi-Agent System:
    // controllers + Swagger + module wiring + events (task #236). The
    // Master AI Orchestrator and AI Knowledge Base's HTTP surface —
    // previously only reachable via AutomationEngineModule's direct
    // injection of AgentCoreModule (see agent.module.ts's doc comment).
    AgentModule,
    // Module 13 — MCP Server core (task #276): the JSON-RPC 2.0 endpoint
    // + Resource/Tool/Prompt registries + session observability.
    McpModule,
    // Module 13 — AI Agent SDK (tasks #281-282): registry + runner for
    // the eleven built-in agents, on top of McpModule's tool/resource
    // registries.
    AgentSdkModule,
    ScriptsModule,
    RelayCommandsModule,
    EvaluationModule,
    DeveloperPortalModule,
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
