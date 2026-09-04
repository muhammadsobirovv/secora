import { Injectable } from '@nestjs/common';

/// A minimal, hand-rolled Prometheus text-exposition-format registry —
/// zero new dependencies (unlike tracing.ts's OTel SDK addition, the
/// Prometheus text format itself is a handful of documented text lines,
/// not something that benefits from a client library the way OTLP
/// export does), covering exactly the metric types this codebase
/// actually needs: Counter and Histogram. See
/// https://prometheus.io/docs/instrumenting/exposition_formats/ for the
/// format this renders.
type LabelSet = Record<string, string>;

function renderLabels(labels: LabelSet): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  return `{${entries.map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`).join(',')}}`;
}

function labelKey(labels: LabelSet): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
}

class Counter {
  private readonly values = new Map<string, { labels: LabelSet; value: number }>();

  constructor(
    public readonly name: string,
    public readonly help: string,
  ) {}

  inc(labels: LabelSet = {}, delta = 1): void {
    const key = labelKey(labels);
    const existing = this.values.get(key);
    if (existing) {
      existing.value += delta;
    } else {
      this.values.set(key, { labels, value: delta });
    }
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    for (const { labels, value } of this.values.values()) {
      lines.push(`${this.name}${renderLabels(labels)} ${value}`);
    }
    return lines.join('\n');
  }
}

/// Fixed bucket boundaries (seconds) — the same default bucket set
/// Prometheus client libraries ship with, appropriate for HTTP request
/// durations ranging from sub-millisecond to multi-second.
const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

class Histogram {
  private readonly series = new Map<
    string,
    { labels: LabelSet; buckets: number[]; counts: number[]; sum: number; count: number }
  >();

  constructor(
    public readonly name: string,
    public readonly help: string,
    private readonly buckets: number[] = DEFAULT_BUCKETS,
  ) {}

  observe(labels: LabelSet, value: number): void {
    const key = labelKey(labels);
    let series = this.series.get(key);
    if (!series) {
      series = { labels, buckets: this.buckets, counts: new Array(this.buckets.length).fill(0) as number[], sum: 0, count: 0 };
      this.series.set(key, series);
    }
    series.sum += value;
    series.count += 1;
    for (let i = 0; i < series.buckets.length; i++) {
      if (value <= series.buckets[i]) series.counts[i] += 1;
    }
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const series of this.series.values()) {
      // Module 13 — Tests (task #295) bug fix: `series.counts[i]` is
      // already the cumulative "how many observations are <= buckets[i]"
      // value — `observe()` increments *every* qualifying bucket per
      // sample, not just the smallest one. Summing across `i` again here
      // (the previous code did `cumulative += series.counts[i]`) double-
      // cumulates an already-cumulative series, producing values that
      // grow past `series.count` and violate the exposition format's
      // core invariant (`_bucket{le="+Inf"}` must be the maximum, equal
      // to `_count`). Caught by `metrics-registry.service.spec.ts`.
      for (let i = 0; i < series.buckets.length; i++) {
        lines.push(`${this.name}_bucket${renderLabels({ ...series.labels, le: String(series.buckets[i]) })} ${series.counts[i]}`);
      }
      lines.push(`${this.name}_bucket${renderLabels({ ...series.labels, le: '+Inf' })} ${series.count}`);
      lines.push(`${this.name}_sum${renderLabels(series.labels)} ${series.sum}`);
      lines.push(`${this.name}_count${renderLabels(series.labels)} ${series.count}`);
    }
    return lines.join('\n');
  }
}

/// App-wide singleton registry (one instance via Nest's default
/// singleton provider scope) — `HttpMetricsInterceptor` writes to it on
/// every request, `MetricsController` reads it on every scrape.
///
/// Module 18 — task #520 (metrics/observability abstraction audit),
/// disclosed known limitations (not fixed this phase — each is a real
/// feature addition, not a bug fix, and none is safely verifiable
/// end-to-end without running the app/scraper in this sandbox):
///  1. HealthController's liveness/readiness checks (database/queue/
///     storage reachability) are never surfaced here as Prometheus gauges
///     (e.g. `up{component="database"}`) — an Alertmanager rule (Module
///     14's configs) can't page on a dependency outage via the metrics
///     pipeline today, only via an external orchestrator's own probe
///     tooling hitting `/health/ready` directly. Wiring this in cleanly
///     means extracting HealthController's inline check logic into a
///     shared, reusable method both controllers call (to avoid two
///     divergent copies of the same DB/queue/storage probes) and making
///     this registry's render path async to accommodate the real
///     round-trip that entails.
///  2. Metrics, structured logs (structured-logger.service.ts), and OTel
///     traces (tracing.ts) are three disjoint systems — no exemplars on
///     histograms, no trace-id-as-metric-label, and `withSpan()` is only
///     wired into two of the roughly seven surfaces this registry
///     instruments (workflow execution, webhook delivery).
///  3. Only Counter/Histogram exist as reusable primitives — there's no
///     Gauge type, so `renderProcessMetrics()` below hand-builds gauge
///     text rather than registering typed Gauge instances the way the
///     counters/histograms above are registered.
/// Tracked as concrete follow-ups in docs/operations/ (Phase 29).
@Injectable()
export class MetricsRegistryService {
  readonly httpRequestsTotal = new Counter('pentesthub_http_requests_total', 'Total HTTP requests processed.');
  readonly httpRequestDurationSeconds = new Histogram(
    'pentesthub_http_request_duration_seconds',
    'HTTP request duration in seconds.',
  );
  readonly webhookDeliveriesTotal = new Counter(
    'pentesthub_webhook_deliveries_total',
    'Total webhook delivery attempts, by outcome.',
  );
  readonly workflowRunsTotal = new Counter('pentesthub_workflow_runs_total', 'Total workflow runs, by terminal status.');

  /// Module 13 — AI Automation Platform Observability (task #290). One
  /// counter/histogram pair per automation surface the platform added in
  /// Module 13, instrumented at the real call site inside each surface's
  /// command handler/dispatcher (not polled) — same "increment where the
  /// outcome is actually known" posture as `workflowRunsTotal` above.
  /// Labels are deliberately low-cardinality: `toolName`/`metricType` are
  /// closed enums from `@pentesthub/shared` (`MCP_TOOL_NAMES`,
  /// `EvaluationMetricType`), never a free-form id — the same "route
  /// pattern, not raw URL" cardinality discipline `HttpMetricsInterceptor`
  /// already follows.
  readonly mcpToolInvocationsTotal = new Counter(
    'pentesthub_mcp_tool_invocations_total',
    'Total MCP tool calls, by tool name and outcome.',
  );
  readonly mcpToolInvocationDurationSeconds = new Histogram(
    'pentesthub_mcp_tool_invocation_duration_seconds',
    'MCP tool call duration in seconds, by tool name.',
  );
  readonly agentSdkRunsTotal = new Counter(
    'pentesthub_agent_sdk_runs_total',
    'Total AI Agent SDK runs, by agent kind (BUILTIN/CUSTOM) and terminal status.',
  );
  readonly scriptExecutionsTotal = new Counter(
    'pentesthub_script_executions_total',
    'Total Script Engine executions, by terminal status (SUCCEEDED/FAILED/TIMEOUT).',
  );
  readonly relayCommandsTotal = new Counter(
    'pentesthub_relay_commands_total',
    'Total Local Execution relay commands, by target and status transition.',
  );
  readonly evaluationRunsTotal = new Counter(
    'pentesthub_evaluation_runs_total',
    'Total AI Evaluation runs, by metric type.',
  );

  /// Real process-level gauges, computed fresh on every scrape (not
  /// polled on an interval) — cheap enough (process.memoryUsage() and
  /// process.uptime() are both synchronous, sub-microsecond calls) that
  /// there's no reason to cache them.
  private renderProcessMetrics(): string {
    const mem = process.memoryUsage();
    const lines = [
      '# HELP pentesthub_process_uptime_seconds Process uptime in seconds.',
      '# TYPE pentesthub_process_uptime_seconds gauge',
      `pentesthub_process_uptime_seconds ${process.uptime()}`,
      '# HELP pentesthub_process_resident_memory_bytes Resident set size in bytes.',
      '# TYPE pentesthub_process_resident_memory_bytes gauge',
      `pentesthub_process_resident_memory_bytes ${mem.rss}`,
      '# HELP pentesthub_process_heap_used_bytes V8 heap used in bytes.',
      '# TYPE pentesthub_process_heap_used_bytes gauge',
      `pentesthub_process_heap_used_bytes ${mem.heapUsed}`,
      '# HELP pentesthub_process_heap_total_bytes V8 heap total in bytes.',
      '# TYPE pentesthub_process_heap_total_bytes gauge',
      `pentesthub_process_heap_total_bytes ${mem.heapTotal}`,
    ];
    return lines.join('\n');
  }

  renderPrometheusText(): string {
    return [
      this.renderProcessMetrics(),
      this.httpRequestsTotal.render(),
      this.httpRequestDurationSeconds.render(),
      this.webhookDeliveriesTotal.render(),
      this.workflowRunsTotal.render(),
      this.mcpToolInvocationsTotal.render(),
      this.mcpToolInvocationDurationSeconds.render(),
      this.agentSdkRunsTotal.render(),
      this.scriptExecutionsTotal.render(),
      this.relayCommandsTotal.render(),
      this.evaluationRunsTotal.render(),
    ].join('\n\n') + '\n';
  }
}
