import type {
  ReconJobLogLevel,
  ReconTool,
  TargetType,
} from '../../../prisma-types.js';

export interface ToolRunTarget {
  id: string;
  type: TargetType;
  value: string;
}

export interface ToolRunContext {
  target: ToolRunTarget;
  job: { id: string; timeoutSeconds: number };
  signal: AbortSignal;
  /// Writes one ReconJobLog row. Called by the runner for progress/stderr
  /// output as the tool runs — this is what powers the live SSE log view.
  onLog: (level: ReconJobLogLevel, message: string) => void;
}

export interface ToolRunResult {
  exitCode: number | null;
  stdout: string;
  timedOut: boolean;
}

/// Every reconnaissance tool implements this — no feature/module code may
/// depend on a specific CLI directly, only on this interface (and the
/// ToolRunnerRegistry that resolves an implementation by ReconTool). Tests
/// inject a fake ToolRunner instead of ever spawning a real subprocess.
export interface ToolRunner {
  readonly tool: ReconTool;
  readonly supportedTargetTypes: TargetType[];
  run(ctx: ToolRunContext): Promise<ToolRunResult>;
}
