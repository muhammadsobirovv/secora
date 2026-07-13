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

interface FeroxbusterConfig {
  wordlist?: string;
  extensions?: string[];
  depth?: number;
}

/// Unlike ffuf/dirsearch, feroxbuster's --json flag genuinely streams
/// ND-JSON to stdout as it runs (one object per discovered path plus a
/// few "state_change"/"statistics" lines this normalizer filters out) —
/// no file-path trick needed.
@Injectable()
export class FeroxbusterScannerRunner implements ScannerRunner {
  readonly scanner = 'FEROXBUSTER' as const;
  readonly supportedTargetTypes: TargetType[] = ['URL'];

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly spawner: ScannerProcessSpawner,
  ) {}

  run(ctx: ScannerRunContext): Promise<ScannerRunResult> {
    const bin = this.configService.get('VULN_TOOL_BIN_FEROXBUSTER', {
      infer: true,
    });
    const config = (ctx.config?.FEROXBUSTER ?? {}) as FeroxbusterConfig;

    const args = ['-u', ctx.target.value, '--json', '--silent', '--no-state'];
    if (config.wordlist) {
      args.push('-w', config.wordlist);
    }
    if (config.extensions && config.extensions.length > 0) {
      args.push('-x', config.extensions.join(','));
    }
    if (config.depth) {
      args.push('-d', String(config.depth));
    }

    return this.spawner.spawn({
      command: bin,
      args,
      signal: ctx.signal,
      onStderrLine: (line) => ctx.onLog('WARN', line),
    });
  }
}
