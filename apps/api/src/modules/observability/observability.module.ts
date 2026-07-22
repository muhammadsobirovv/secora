import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HealthController } from './controllers/health.controller.js';
import { MetricsController } from './controllers/metrics.controller.js';
import { MetricsRegistryService } from './metrics-registry.service.js';
import { HttpMetricsInterceptor } from './http-metrics.interceptor.js';

/// Module 10 — Observability. Registers the health/metrics controllers,
/// the Prometheus registry singleton, and the global HTTP metrics
/// interceptor. `MetricsRegistryService` is exported so other feature
/// modules (PublicApiModule's WebhookDeliveryQueueService,
/// AutomationEngineModule's WorkflowExecutorService) can inject it
/// directly to increment domain-specific counters
/// (`webhookDeliveriesTotal`, `workflowRunsTotal`) — those modules add
/// `ObservabilityModule` to their own `imports` array to get it.
@Module({
  controllers: [HealthController, MetricsController],
  providers: [
    MetricsRegistryService,
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
  exports: [MetricsRegistryService],
})
export class ObservabilityModule {}
