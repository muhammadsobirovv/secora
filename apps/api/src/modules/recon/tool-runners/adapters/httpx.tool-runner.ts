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

/// Binary name defaults to "httpx-toolkit", NOT "httpx" — on Kali, plain
/// "httpx" on PATH resolves to Python's unrelated HTTP client CLI. See
/// RECON_TOOL_BIN_HTTPX in env.validation.ts.
@Injectable()
export class HttpxToolRunner implements ToolRunner {
  readonly tool = 'HTTPX' as const;
  readonly supportedTargetTypes: TargetType[] = ['URL', 'DOMAIN', 'SUBDOMAIN'];

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly spawner: ToolProcessSpawner,
  ) {}

  run(ctx: ToolRunContext): Promise<ToolRunResult> {
    const bin = this.configService.get('RECON_TOOL_BIN_HTTPX', { infer: true });
    return this.spawner.spawn({
      command: bin,
      args: [
        '-u',
        ctx.target.value,
        '-silent',
        '-json',
        '-title',
        '-tech-detect',
        '-status-code',
        '-server',
      ],
      signal: ctx.signal,
      onStderrLine: (line) => ctx.onLog('WARN', line