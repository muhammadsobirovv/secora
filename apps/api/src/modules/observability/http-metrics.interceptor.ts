import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { tap } from 'rxjs/operators';
import { MetricsRegistryService } from './metrics-registry.service.js';

/// Records `pentesthub_http_requests_total` and
/// `pentesthub_http_request_duration_seconds` for every REST request —
/// registered globally via `APP_INTERCEPTOR` in ObservabilityModule.
/// Uses the matched route pattern (`req.route.path`, e.g.
/// "/enterprise/organizations/:organizationId/workflows/:id"), not the
/// raw URL, as the `route` label — using raw URLs would create unbounded
/// cardinality (a new time series per unique id ever requested), which
/// is exactly the mistake Prometheus's own best-practices guide warns
/// against.
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsRegistryService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const start = process.hrtime.bigint();

    const recordMetrics = (): void => {
      const route = (request.route as { path?: string } | undefined)?.path ?? request.path ?? 'unknown';
      const method = request.method;
      const statusCode = String(response.statusCode);
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;

      this.metrics.httpRequestsTotal.inc({ method, route, status: statusCode });
      this.metrics.httpRequestDurationSeconds.observe({ method, route, status: statusCode }, durationSeconds);
    };

    return next.handle().pipe(
      tap({
        next: recordMetrics,
        error: recordMetrics,
      }),
    );
  }
}
