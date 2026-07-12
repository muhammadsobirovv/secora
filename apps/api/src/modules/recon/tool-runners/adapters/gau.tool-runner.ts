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

/// gau (getallurls) queries Wayback Machine, Common Crawl, OTX, and
/// urlscan.io for every URL on record for the domain, and prints them one
/// per line — a passive, API-only lookup like subfinder, never touching
/// the target directly.
@Injectable()
export class GauToolRunner implements ToolRunner {
  readonly tool = 'GAU' as const;
  readonly supportedTargetTypes: TargetType[] = ['DOMAIN', 'SUBDOMAIN'];

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly spawner: ToolProcessSpawner,
  ) {}

  run(ctx: ToolRunContext): Promise<ToolRunResult> {
    const bin = this.configService.get('RECON_TOOL_BIN_GAU', { infer: true });
    return this.spawner.spawn({
      command: bin,
      args: [ctx.target.value],
      signal: ctx.signal,
      onStderrLine: (line) => ctx.onLog('WARN', line