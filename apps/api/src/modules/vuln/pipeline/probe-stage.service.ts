import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { formatStageMarker } from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import type { VulnScanJobLogLevel } from '../../../prisma-types.js';
import { ScannerProcessSpawner } from '../scanner-runners/process/spawn-scanner-process.util.js';
import { parseHttpxJsonl } from './parsers.js';
import { resolvePinnedHost, unpinUrl, type PinnedHost } from './pin.util.js';
import { redactArgv } from './redact-argv.util.js';
import { partitionByApex } from './scope.util.js';
import { buildHttpxArgs, HTTPX_STAGE_TIMEOUT_SECONDS } from './tool-catalog.js';

export interface ProbeStageInput {
  /// The verified host, already resolved once and checked (see resolvePinnedHost).
  pin: PinnedHost;
  signal: AbortSignal;
  onLog: (level: VulnScanJobLogLevel, message: string) => void;
  onCommand?: (info: { tool: string; command: string; argv: string[] }) => void;
}

export type ProbeOutcome = 'OK' | 'TIMED_OUT' | 'ABORTED';

export interface ProbeStageResult {
  outcome: ProbeOutcome;
  /// Live web origins on the verified host, with the real hostname (never the
  /// pinned IP), e.g. "https://shop.example.org".
  liveUrls: string[];
}

function hostnameOf(url: string, base?: string): string | null {
  try {
    return new URL(url, base).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/// Stage 1 of the pipeline: probe the verified host with httpx to learn which
/// web services are live, so the scan stage only targets real endpoints.
///
/// The host is reached through its pinned IP (no re-resolution). httpx does
/// not follow redirects; a redirect target is only inspected: if it leaves the
/// verified host's scope it is dropped and logged, otherwise it is logged as
/// not followed. Idempotent and read-only, so a resumed job simply re-runs it.
@Injectable()
export class PipelineProbeStage {
  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly spawner: ScannerProcessSpawner,
  ) {}

  /// Resolves the target host ONCE. Every address must be public (unless a
  /// non-production lab opts in); the result is what both stages connect to.
  resolvePin(host: string): Promise<PinnedHost> {
    return resolvePinnedHost(host, {
      allowPrivateTargets: this.configService.get('ACTIVE_SCAN_ALLOW_PRIVATE_TARGETS', { infer: true }),
    });
  }

  async run(input: ProbeStageInput): Promise<ProbeStageResult> {
    const { pin, onLog } = input;
    const bin = this.configService.get('VULN_TOOL_BIN_HTTPX', { infer: true });
    const args = buildHttpxArgs({ target: pin.host, pin });

    onLog('INFO', formatStageMarker('recon', 'start'));
    onLog('INFO', `$ ${bin} ${redactArgv(args).join(' ')}`);
    input.onCommand?.({ tool: 'httpx', command: bin, argv: args });

    const stageSignal = AbortSignal.any([
      input.signal,
      AbortSignal.timeout(HTTPX_STAGE_TIMEOUT_SECONDS * 1000),
    ]);
    const result = await this.spawner.spawn({
      command: bin,
      args,
      signal: stageSignal,
      onStderrLine: (line) => onLog('WARN', line),
    });

    if (result.timedOut) {
      const aborted = input.signal.aborted;
      onLog(
        'WARN',
        aborted
          ? 'Recon stopped: the job was cancelled or timed out.'
          : `Recon stage timed out after ${HTTPX_STAGE_TIMEOUT_SECONDS}s.`,
      );
      return { outcome: aborted ? 'ABORTED' : 'TIMED_OUT', liveUrls: [] };
    }

    const live = new Set<string>();
    for (const record of parseHttpxJsonl(result.stdout)) {
      const url = unpinUrl(record.url, pin);
      const host = hostnameOf(url);
      const origin = originOf(url);
      if (!host || !origin || record.statusCode === null) continue;

      if (partitionByApex([host], pin.host).inScope.length === 0) {
        onLog('WARN', `Skipped ${url}: outside the verified scope (${pin.host}).`);
        continue;
      }
      onLog(
        'INFO',
        `LIVE ${url} [${record.statusCode}]${record.title ? ` "${record.title}"` : ''}${
          record.webServer ? ` ${record.webServer}` : ''
        }`,
      );
      live.add(origin);

      if (record.location) {
        const target = unpinUrl(record.location, pin);
        const targetHost = hostnameOf(target, url);
        const inScope = targetHost !== null && partitionByApex([targetHost], pin.host).inScope.length > 0;
        onLog(
          inScope ? 'INFO' : 'WARN',
          inScope
            ? `Redirect to ${target} was not followed.`
            : `Redirect to ${target} dropped: outside the verified scope.`,
        );
      }
    }

    onLog('INFO', formatStageMarker('recon', live.size > 0 ? 'done' : 'skipped'));
    if (live.size === 0) {
      onLog('WARN', 'No live web service found on the host; the scan stage will not run.');
    }
    return { outcome: 'OK', liveUrls: [...live] };
  }
}
