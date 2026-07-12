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

/// WhatWeb has no -json flag like the ProjectDiscovery tools — JSON goes
/// to stdout via --log-json=-.
@Injectable()
export class WhatWebToolRunner implements ToolRunner {
  readonly tool = 'WHATWEB' as const;
  readonly supportedTargetTypes: TargetType[] = ['URL', 'DOMAIN', 'SUBDOMAIN'];

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly spawner: ToolProcessSpawner,
  ) {}

  run(ctx: ToolRunContext): Promise<ToolRunResult> {
    const bin = this.configService.get('RECON_TOOL_BIN_WHATWEB', {
      infer: true,
    });
    return this.spawner.spawn({
      command: bin,
      args: ['--log-json=-', '--no-errors', ctx.target.value],
      signal: ctx.signal,
      onStderrLine: (line) => ctx.onLog('