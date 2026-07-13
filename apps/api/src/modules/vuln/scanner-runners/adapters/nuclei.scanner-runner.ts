import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../../config/env.validation.js';
import { ScannerProcessSpawner } from '../process/spawn-scanner-process.util.js';
import type {
  ScannerRunContext,
  ScannerRunner,
  ScannerRunResult,
} from '../scanner-runner.interface.js';
import type { TargetType } from '../../../../prisma-types.js';

interface NucleiConfig {
  severity?: string[];
  tags?: string[];
  templates?: string[];
}

/// Nuclei is the canonical template-matching scanner: it resolves+probes a
/// bare host itself (unlike the pure content-discovery fuzzers below), so
/// it accepts every target type the platform has an HTTP-adjacent notion
/// of. -jsonl streams one JSON object per match to stdout — no file
/// round-trip needed, unlike gowitness in Module 3.
@Injectable()
export class NucleiScannerRunner implements ScannerRunner {
  readonly scanner = 'NUCLEI' as const;
  readonly supportedTargetTypes: TargetType[] = [
    'URL',
    'DOMAIN',
    'SUBDOMAIN',
    'IP_ADDRESS',
  ];

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly spawner: ScannerProcessSpawner,
  ) {}

  run(ctx: ScannerRunContext): Promise<ScannerRunResult> {
    const bin = this.configService.get('VULN_TOOL_BIN_NUCLEI', {
      infer: true,
    });
    const config = (ctx.config?.NUCLEI ?? {}) as NucleiConfig;

    const args = ['-u', ctx.target.value, '-jsonl', '-silent', '-no-color'];
    if (config.severity && config.severity.length > 0) {
      args.push('-severity', config.severity.join(','));
    }
    if (config.tags && config.tags.length > 0) {
      args.push('-tags', config.tags.join(','));
    }
    if (config.templates && config.templates.length > 0) {
      args.push('-templates', config.templates.join(','));
    }

    return this.spawner.spawn({
      command: bin,
      args,
      signal: ctx.signal,
      onStderrLine: (line) => ctx.onLog('WARN', line),
    });
  }
}
