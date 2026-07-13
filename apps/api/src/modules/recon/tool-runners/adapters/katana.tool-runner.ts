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

/// Crawl depth capped at 2 — katana is a real crawler (it fetches pages,
/// not just queries a passive API like subfinder/amass), so an unbounded
/// depth against a hostile or huge target could run indefinitely within
/// the job's timeout budget instead of finishing early with partial
/// results. `-silent` gives plain text, one discovered URL per line.
@Injectable()
export class KatanaToolRunner implements ToolRunner {
  readonly tool = 'KATANA' as const;
  readonly supportedTargetTypes: TargetType[] = ['URL', 'DOMAIN', 'SUBDOMAIN'];

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly spawner: ToolProcessSpawner,
  ) {}

  run(ctx: ToolRunContext): Promise<ToolRunResult> {
    const bin = this.configService.get('RECON_TOOL_BIN_KATANA', {
      infer: true,
    });
    return this.spawner.spawn({
      command: bin,
      args: ['-u', ctx.target.value, '-silent', '-depth', '2'],
      signal: ctx.signal,
      onStderrLine: (line) => ctx.onLog('WARN', line),
    });
  }
}
