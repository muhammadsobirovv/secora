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

interface DirsearchConfig {
  wordlist?: string;
  extensions?: string[];
}

/// Deliberately does NOT ask for --format json -o (dirsearch's JSON mode
/// only ever writes to a file, the same limitation ffuf has) — instead
/// this reads dirsearch's normal human-readable stdout table directly
/// (one `[hh:mm:ss] 200 -    1KB - /path` line per hit) and lets
/// DirsearchNormalizer parse it with a regex. Demonstrates the framework
/// doesn't require a scanner to have a machine-readable stdout mode at
/// all — a plain-text line format is just as normalizable.
@Injectable()
export class DirsearchScannerRunner implements ScannerRunner {
  readonly scanner = 'DIRSEARCH' as const;
  readonly supportedTargetTypes: TargetType[] = ['URL'];

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly spawner: ScannerProcessSpawner,
  ) {}

  run(ctx: ScannerRunContext): Promise<ScannerRunResult> {
    const bin = this.configService.get('VULN_TOOL_BIN_DIRSEARCH', {
      infer: true,
    });
    const config = (ctx.config?.DIRSEARCH ?? {}) as DirsearchConfig;

    const args = ['-u', ctx.target.value, '--quiet'];
    if (config.wordlist) {
      args.push('-w', config.wordlist);
    }
    if (config.extensions && config.extensions.length > 0) {
      args.push('-e', config.extensions.join(','));
    }

    return this.spawner.spawn({
      command: bin,
      args,
      signal: ctx.signal,
      onStderrLine: (line) => ctx.onLog('WARN', line),
    });
  }
}
