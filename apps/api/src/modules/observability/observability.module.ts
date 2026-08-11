import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { HealthController } from './controllers/health.controller.js';
import { MetricsController } from './controllers/metrics.controller.js';
import { AiPlatformObservabilityController } from './controllers/ai-platform-observability.controller.js';
import { MetricsRegistryService } from './metrics-registry.service.js';
import { HttpMetricsInterceptor } from './http-metrics.interceptor.js';
import { AiPlatformObservabilityRepository } from './ai-platform-observability.repository.js';
import { GetAiPlatformObservabilityHandler } from './queries/ai-platform-observability.query.js';

/// Module 10 — Observability, extended by Module 13 (task #290).
/// Registers the health/metrics controllers, the Prometheus registry
/// singleton, and the global HTTP metrics interceptor.
/// `MetricsRegistryService` is exported so other feature modules
/// (PublicApiModule's WebhookDeliveryQueueService,
/// AutomationEngineModule's WorkflowExecutorService, and — as of Module
/// 13 — McpModule, AgentSdkModule, ScriptsModule, RelayCommandsModule,
/// EvaluationModule) can inject it directly to increment domain-specific
/// counters — those modules add `ObservabilityModule` to their own
/// `imports` array to get it. `ObservabilityModule` deliberately never
/// imports any of those feature modules back (see
/// `AiPlatformObservabilityRepository`'s doc comment) — it stays a
/// dependency-free leaf other modules point at, only importing
/// `WorkspacesModule` for the new dashboard query's personal-workspace
/// resolution.
///
/// Module 14 (task #309) added: `deploy/prometheus/` (scrape config +
/// alert rules referencing the exact metric names this module emits),
/// `deploy/grafana/` (dashboard + datasource provisioning),
/// `docker-compose.monitoring.yml` (optional Prometheus/Grafana/
/// Alertmanager overlay), and a real `startupProbe` in
/// `deploy/k8s/10-api-deployment.yaml` (reusing `HealthController`'s
/// liveness handler with more lenient timing — the idiomatic
/// Kubernetes pattern, not a new endpoint). The remaining Module 14
/// "Performance/Health/Queue/Worker/Plugin Dashboard" JSON endpoints
/// (as opposed to raw Prometheus text) are built as part of the Admin
/// Console task (`ClusterOverviewDto` in `@pentesthub/shared`'s
/// `infrastructure.ts`) rather than here, since they aggregate across
/// several other modules (`distributed-jobs`, `backups`, the provider
/// abstractions) the same way `AiPlatformObservabilityRepository`
/// already aggregates for the AI-platform dashboard above.
@Module({
  imports: [WorkspacesModule],
  controllers: [HealthController, MetricsController, AiPlatformObservabilityController],
  providers: [
    MetricsRegistryService,
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
    AiPlatformObservabilityRepository,
    GetAiPlatformObservabilityHandler,
  ],
  exports: [MetricsRegistryService],
})
export class ObservabilityModule {}
