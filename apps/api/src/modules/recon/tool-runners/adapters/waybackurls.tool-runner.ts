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

/// waybackurls queries the Wayback Machine's CDX API only (a narrower,
/// single-source sibling of gau, which also covers Common Crawl/OTX/
/// urlscan.io) and prints one archived URL per line. Kept as its own
/// tool/adapter rather than folded into gau because a user may want just
/// the Wayback-specific view — findings still dedup against gau's output
/// on the same URL regardless.
@Injectable()
export class WaybackurlsToolRunner implements ToolRunner {
  readonly tool = 'WAYBACKURLS' as const;
  readonly supportedTargetTypes: TargetType[] = ['DOMAIN', 'SUBDOMAIN'];

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly spawner: ToolProcessSpawner,
  ) {}

  run(ctx: ToolRunContext): Promise<ToolRunResult> {
    const bin = this.configService.get('RECON_TOOL_BIN_WAYBACKURLS', {
      infer: true,
    });
    return this.spawner.spawn({
      command: bin,
      args: [ctx.target.value],
      signal: ctx.signal,
      onStderrLine: (line) => ctx.onLog('WARN', line),
    });
  }
}
