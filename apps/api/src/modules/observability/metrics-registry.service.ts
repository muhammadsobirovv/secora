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
      let cumulative = 0;
      for (let i = 0; i < series.buckets.length; i++) {
        cumulative += series.counts[i];
        lines.push(`${this.name}_bucket${renderLabels({ ...series.labels, le: String(series.buckets[i]) })} ${cumulative}`);
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
    ].join('\n\n') + '\n';
  }
}
