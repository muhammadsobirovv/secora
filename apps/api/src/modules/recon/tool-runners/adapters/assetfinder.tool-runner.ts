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

/// Plain text output, one subdomain per line — no JSON mode. The
/// Normalizer treats stdout as newline-delimited hostnames.
@Injectable()
export class AssetfinderToolRunner implements ToolRunner {
  readonly tool = 'ASSETFINDER' as const;
  readonly supportedTargetTypes: TargetType[] = ['DOMAIN'];

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly spawner: ToolProcessSpawner,
  ) {}

  run(ctx: ToolRunContext): Promise<ToolRunResult> {
    const bin = this.configService.get('RECON_TOOL_BIN_ASSETFINDER', {
      infer: true,
    });
    return this.spawner.spawn({
      command: bin,
      args: ['--subs-only', ctx.target.value],
      signal: ctx.signal,
      onStderrLine: (line) => ctx.onLog('WARN', line),
    });
  }
}
