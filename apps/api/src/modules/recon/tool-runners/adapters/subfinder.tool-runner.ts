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
export class SubfinderToolRunner implements ToolRunner {
  readonly tool = 'SUBFINDER' as const;
  readonly supportedTargetTypes: TargetType[] = ['DOMAIN'];

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly spawner: ToolProcessSpawner,
  ) {}

  run(ctx: ToolRunContext): Promise<ToolRunResult> {
    const bin = this.configService.get('RECON_TOOL_BIN_SUBFINDER', {
      infer: true,
    });
    return this.spawner.spawn({
      command: bin,
      args: ['-d', ctx.target.value, '-silent', '-json'],
      signal: ctx.signal,
      onStderrLine: (line) => ctx.onLog('