import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../../config/env.validation.js';
import { ToolProcessSpawner } from '../process/spawn-tool-process.util.js';
import type {
  ToolRunContext,
  ToolRunner,
  ToolRunResult,
} from '../tool-runner.interface.js';
import type { TargetType } from '../../../../prisma-types.js';

/// Plain `whois <domain>` — output format/fields vary by TLD and
/// registrar, which is exactly why WhoisNormalizer parses generically
/// (any "Key: Value" line) instead of assuming one registrar's schema.
@Injectable()
export class WhoisToolRunner implements ToolRunner {
  readonly tool = 'WHOIS' as const;
  readonly supportedTargetTypes: TargetType[] = ['DOMAIN'];

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly spawner: ToolProcessSpawner,
  ) {}

  run(ctx: ToolRunContext): Promise<ToolRunResult> {
    const bin = this.configService.get('RECON_TOOL_BIN_WHOIS', { infer: true });
    return this.spawner.spawn({
      command: bin,
      args: [ctx.target.value],
      signal: ctx.signal,
      onStderrLine: (line) => ctx.onLog('WARN', line),
    });
  }
}
