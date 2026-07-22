import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { trace, type Span, type Tracer } from '@opentelemetry/api';

/// Module 10 — Observability: distributed tracing. `OTEL_EXPORTER_OTLP_ENDPOINT`
/// (env.validation.ts) points at an OTLP/HTTP collector (Jaeger, Tempo,
/// Honeycomb, a vendor gateway, etc.); when unset, the SDK still starts
/// (spans are created — `withSpan()` calls throughout the codebase are
/// real, not no-ops at the call-site) but nothing is exported anywhere,
/// which is the correct behavior for local dev/sandbox environments with
/// no collector running.
///
/// Deliberately NOT using `@opentelemetry/auto-instrumentations-node`
/// (which would auto-instrument Express/Prisma/http and pull in a much
/// larger dependency tree) — this project's HTTP layer already has a
/// purpose-built `HttpMetricsInterceptor` for request-level metrics, and
/// auto-instrumentation's main added value (DB query spans) is achieved
/// more precisely with a handful of explicit `withSpan()` calls at
/// genuinely interesting boundaries (workflow step execution, webhook
/// delivery) than by tracing every Prisma call indiscriminately. This
/// keeps the tracing dependency surface to exactly the packages needed
/// for manual instrumentation + OTLP export.
///
/// NOTE ON VERIFICATION: `@opentelemetry/*` packages were added to
/// apps/api/package.json but have not been `pnpm install`'d or
/// `pnpm build`'d in this sandbox (no registry network access — the same
/// disclosed constraint that applies to every other Module 10 npm
/// dependency addition; see the GraphQL API module's equivalent note).
/// Run `pnpm install && pnpm --filter api build` in a real environment
/// before relying on this.
const SERVICE_NAME = 'pentesthub-api';
const SERVICE_VERSION = process.env.npm_package_version ?? '0.0.1';

let sdk: NodeSDK | undefined;
let tracer: Tracer | undefined;

export function startTracing(): void {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
    }),
    // Passing no exporter/url when OTEL_EXPORTER_OTLP_ENDPOINT is unset
    // still creates a functioning (locally-processing, non-exporting)
    // SDK — OTLPTraceExporter defaults to http://localhost:4318 if given
    // no url, which is harmless (spans just fail to send silently) but
    // slightly wasteful; only constructing an exporter when an endpoint
    // is actually configured avoids that.
    traceExporter: endpoint ? new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }) : undefined,
  });

  sdk.start();
  tracer = trace.getTracer(SERVICE_NAME, SERVICE_VERSION);
}

export async function stopTracing(): Promise<void> {
  await sdk?.shutdown();
}

/// Wraps `fn` in a span named `name`, recording success/failure
/// (`span.recordException` + ERROR status on throw) and always ending
/// the span. Falls back to a no-op tracer (still calls `fn` normally) if
/// `startTracing()` hasn't run yet — keeps this safe to call from code
/// paths that might execute before bootstrap (e.g. a unit test that
/// imports a service directly without booting the full app).
export async function withSpan<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T> {
  const activeTracer = tracer ?? trace.getTracer(SERVICE_NAME, SERVICE_VERSION);
  return activeTracer.startActiveSpan(name, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: 1 }); // SpanStatusCode.OK
      return result;
    } catch (error) {
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.setStatus({ code: 2, message: error instanceof Error ? error.message : String(error) }); // SpanStatusCode.ERROR
      throw error;
    } finally {
      span.end();
    }
  });
}
