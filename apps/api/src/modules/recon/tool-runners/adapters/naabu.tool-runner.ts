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
export class NaabuToolRunner implements ToolRunner {
  readonly tool = 'NAABU' as const;
  readonly supportedTargetTypes: TargetType[] = [
    'IP_ADDRESS',
    'CIDR',
    'DOMAIN',
    'SUBDOMAIN',
  ];

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly spawner: ToolProcessSpawner,
  ) {}

  run(ctx: ToolRunContext): Promise<ToolRunResult> {
    const bin = this.configService.get('RECON_TOOL_BIN_NAABU', { infer: true });
    return this.spawner.spawn({
      command: bin,
      args: [
        '-host',
        ctx.target.value,
        '-silent',
        '-json',
        '-top-ports',
        '100',
      ],
      signal: ctx.sig