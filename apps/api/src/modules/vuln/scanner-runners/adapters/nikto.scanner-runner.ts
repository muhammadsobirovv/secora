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

/// nikto has no native JSON output — same situation nmap was in for
/// Module 3 — so this always requests XML to stdout (-Format xml -output
/// -, "-" being nikto's own stdout sentinel) and lets NiktoNormalizer
/// parse the tree. Resolves a bare host itself, so (like Nuclei) it
/// accepts every HTTP-adjacent target type, not just full URLs.
@Injectable()
export class NiktoScannerRunner implements ScannerRunner {
  readonly scanner = 'NIKTO' as const;
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
    const bin = this.configService.get('VULN_TOOL_BIN_NIKTO', {
      infer: true,
    });
    return this.spawner.spawn({
      command: bin,
      args: ['-h', ctx.target.value, '-Format', 'xml', '-output', '-'],
      signal: ctx.signal,
      onStderrLine: (line) => ctx.onLog('WARN', line),
    });
  }
}
