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

interface FfufConfig {
  wordlist?: string;
  extensions?: string[];
  matchCodes?: string;
}

/// Pure content-discovery fuzzer — only ever makes sense against a full
/// URL (see SCANNER_TARGET_TYPE_COMPATIBILITY). ffuf's own JSON output
/// mode only ever writes to a file, never streams JSONL to stdout, but
/// `/dev/stdout` is a valid file path on Linux, so `-o /dev/stdout`
/// captures the single end-of-run JSON document via the same stdout
/// buffer every other adapter reads — no extra disk round-trip needed.
@Injectable()
export class FfufScannerRunner implements ScannerRunner {
  readonly scanner = 'FFUF' as const;
  readonly supportedTargetTypes: TargetType[] = ['URL'];

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly spawner: ScannerProcessSpawner,
  ) {}

  run(ctx: ScannerRunContext): Promise<ScannerRunResult> {
    const bin = this.configService.get('VULN_TOOL_BIN_FFUF', { infer: true });
    const config = (ctx.config?.FFUF ?? {}) as FfufConfig;
    // Non-null assertion is safe here: VULN_TOOL_WORDLIST_FFUF has a zod
    // `.default(...)` in env.validation.ts, so it's always populated after
    // validateEnv() runs — ConfigService.get()'s return type just can't
    // statically express that a key is default-backed.
    const wordlist: string =
      config.wordlist ??
      this.configService.get('VULN_TOOL_WORDLIST_FFUF', { infer: true });
    const base = ctx.target.value.replace(/\/+$/, '');

    const args: string[] = [
      '-u',
      `${base}/FUZZ`,
      '-w',
      wordlist,
      '-of',
      'json',
      '-o',
      '/dev/stdout',
      '-s',
    ];
    if (config.extensions && config.extensions.length > 0) {
      args.push('-e', config.extensions.join(','));
    }
    if (config.matchCodes) {
      args.push('-mc', config.matchCodes);
    }

    return this.spawner.spawn({
      command: bin,
      args,
      signal: ctx.signal,
      onStderrLine: (line) => ctx.onLog('WARN', line),
    });
  }
}
