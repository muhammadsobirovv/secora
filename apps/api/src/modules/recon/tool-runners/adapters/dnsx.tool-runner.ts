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

@Injectable()
export class DnsxToolRunner implements ToolRunner {
  readonly tool = 'DNSX' as const;
  readonly supportedTargetTypes: TargetType[] = ['DOMAIN', 'SUBDOMAIN'];

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly spawner: ToolProcessSpawner,
  ) {}

  run(ctx: ToolRunContext): Promise<ToolRunResult> {
    const bin = this.configService.get('RECON_TOOL_BIN_DNSX', { infer: true });
    return this.spawner.spawn({
      command: bin,
      args: [
        '-d',
        ctx.target.value,
        '-silent',
        '-json',
        '-a',
        '-aaaa',
        '-cname',
        '-mx',
        '-ns',
        '-txt',
      ],
      signal: ctx.signal,
      onStderrLine: (line) => ctx.onLog('WARN', line