import type {
  VulnScanJobLogLevel,
  VulnScanner,
  TargetType,
} from '../../../prisma-types.js';

export interface ScannerRunTarget {
  id: string;
  type: TargetType;
  value: string;
}

export interface ScannerRunContext {
  target: ScannerRunTarget;
  job: { id: string; timeoutSeconds: number };
  /// The effective per-scanner options for this job — VulnScanJob.config
  /// keyed by VulnScanner, e.g. `config.NUCLEI` -> {severity, tags}. A
  /// scanner adapter reads only its own key; absent means "use defaults."
  config: Record<string, unknown> | null;
  signal: AbortSignal;
  /// Writes one VulnScanJobLog row. Called by the runner for progress/
  /// stderr output — powers the live SSE log view, identical role to
  /// Recon's ToolRunContext.onLog.
  onLog: (level: VulnScanJobLogLevel, message: string) => void;
}

export interface ScannerRunResult {
  exitCode: number | null;
  stdout: string;
  timedOut: boolean;
}

/// Every scanner implements this — no feature/module code may depend on a
/// specific CLI directly, only on this interface (and the
/// ScannerRunnerRegistry that resolves an implementation by VulnScanner).
/// Adding a new scanner (SQLMap, XSStrike, Dalfox, Wapiti, OWASP ZAP — the
/// spec's documented extension points) means: one class implementing this
/// interface, one Normalizer, one registry entry — zero changes anywhere
/// else, exactly mirroring Module 3's ToolRunner contract (see
/// docs/adr/0004-vulnerability-engine-module.md).
export interface ScannerRunner {
  readonly scanner: VulnScanner;
  readonly supportedTargetTypes: TargetType[];
  run(ctx: ScannerRunContext): Promise<ScannerRunResult>;
}
