import { describe, expect, it } from '@jest/globals';
import { MetricsRegistryService } from './metrics-registry.service.js';

/// Module 13 — Observability tests (task #295). Pure class, zero
/// constructor dependencies — instantiated directly, no
/// `@nestjs/testing` needed, same style as `plugin-signature.util.spec.ts`.
describe('MetricsRegistryService', () => {
  it('renders zero-sample text output for every metric section', () => {
    const registry = new MetricsRegistryService();
    const text = registry.renderPrometheusText();

    // Process gauges always render (computed fresh, no samples needed).
    expect(text).toContain('pentesthub_process_uptime_seconds');
    // Every Module 13 series should have HELP/TYPE lines even before any
    // sample is recorded — Counter/Histogram always render their header,
    // even with zero series.
    for (const name of [
      'pentesthub_mcp_tool_invocations_total',
      'pentesthub_mcp_tool_invocation_duration_seconds',
      'pentesthub_agent_sdk_runs_total',
      'pentesthub_script_executions_total',
      'pentesthub_relay_commands_total',
      'pentesthub_evaluation_runs_total',
    ]) {
      expect(text).toContain(`# TYPE ${name}`);
    }
  });

  it('increments a counter per distinct label combination, not per call', () => {
    const registry = new MetricsRegistryService();
    registry.mcpToolInvocationsTotal.inc({ tool: 'create_project', outcome: 'success' });
    registry.mcpToolInvocationsTotal.inc({ tool: 'create_project', outcome: 'success' });
    registry.mcpToolInvocationsTotal.inc({ tool: 'create_project', outcome: 'error' });

    const text = registry.renderPrometheusText();
    expect(text).toContain('pentesthub_mcp_tool_invocations_total{tool="create_project",outcome="success"} 2');
    expect(text).toContain('pentesthub_mcp_tool_invocations_total{tool="create_project",outcome="error"} 1');
  });

  it('records histogram observations into the correct cumulative buckets', () => {
    const registry = new MetricsRegistryService();
    // Default buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10].
    // Observations chosen to be exactly representable in IEEE754 binary
    // (0.25, 0.5, 2 — all powers of two or exact fractions thereof) so
    // the `_sum` assertion below doesn't fight floating-point rounding.
    // Expected per-bucket cumulative counts ("how many of the 3
    // observations are <= X"): le=0.25 -> 1 (just 0.25), le=0.5 -> 2
    // (0.25 and 0.5), le=2.5 -> 3 (all). This monotonic 1 -> 2 -> 3
    // progression is exactly what a real bug (found while writing this
    // test) violated: `Histogram.render()` used to sum these already-
    // cumulative per-bucket counts a *second* time, so `le="2.5"` would
    // have rendered well above `_count` instead of equal to it.
    registry.mcpToolInvocationDurationSeconds.observe({ tool: 'run_recon' }, 0.25);
    registry.mcpToolInvocationDurationSeconds.observe({ tool: 'run_recon' }, 0.5);
    registry.mcpToolInvocationDurationSeconds.observe({ tool: 'run_recon' }, 2);

    const text = registry.renderPrometheusText();
    expect(text).toContain('pentesthub_mcp_tool_invocation_duration_seconds_bucket{tool="run_recon",le="0.1"} 0');
    expect(text).toContain('pentesthub_mcp_tool_invocation_duration_seconds_bucket{tool="run_recon",le="0.25"} 1');
    expect(text).toContain('pentesthub_mcp_tool_invocation_duration_seconds_bucket{tool="run_recon",le="0.5"} 2');
    expect(text).toContain('pentesthub_mcp_tool_invocation_duration_seconds_bucket{tool="run_recon",le="2.5"} 3');
    expect(text).toContain('pentesthub_mcp_tool_invocation_duration_seconds_bucket{tool="run_recon",le="+Inf"} 3');
    expect(text).toContain('pentesthub_mcp_tool_invocation_duration_seconds_count{tool="run_recon"} 3');
    expect(text).toContain('pentesthub_mcp_tool_invocation_duration_seconds_sum{tool="run_recon"} 2.75');
  });

  it('keeps separate series for different label sets on the same metric', () => {
    const registry = new MetricsRegistryService();
    registry.agentSdkRunsTotal.inc({ kind: 'BUILTIN', status: 'SUCCEEDED' });
    registry.agentSdkRunsTotal.inc({ kind: 'CUSTOM', status: 'FAILED' });

    const text = registry.renderPrometheusText();
    expect(text).toContain('pentesthub_agent_sdk_runs_total{kind="BUILTIN",status="SUCCEEDED"} 1');
    expect(text).toContain('pentesthub_agent_sdk_runs_total{kind="CUSTOM",status="FAILED"} 1');
  });
});
