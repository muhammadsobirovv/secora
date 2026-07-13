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

/// Passive mode only (`-passive`, no `-active`) — deliberately never does
/// active DNS brute-forcing or zone transfers by default, matching this
/// module's existing tools (subfinder/assetfinder are passive-only by
/// construction; amass is the one adapter that could do more, so the
/// restriction here is explicit rather than incidental). `-silent` gives
/// plain text, one subdomain per line — same shape as assetfinder's
/// output, so the Normalizer is nearly identical.
@Injectable()
export class AmassToolRunner implements ToolRunner {
  readonly tool = 'AMASS' as const;
  readonly supportedTargetTypes: TargetType[] = ['DOMAIN'];

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly spawner: ToolProcessSpawner,
  ) {}

  run(ctx: ToolRunContext): Promise<ToolRunResult> {
    const bin = this.configService.get('RECON_TOOL_BIN_AMASS', { infer: true });
    return this.spawner.spawn({
      command: bin,
      args: ['enum', '-passive', '-silent', '-d', ctx.target.value],
      signal: ctx.signal,
      onStderrLine: (line) => ctx.onLog('WARN', line),
    });
  }
}
