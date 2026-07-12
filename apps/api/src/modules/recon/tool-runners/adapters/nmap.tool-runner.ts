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

/// nmap has no native JSON output — always request XML to stdout (-oX -)
/// and let NmapNormalizer parse it. No explicit scan-type flag: nmap
/// auto-falls-back to a TCP connect scan when it lacks raw-socket
/// privileges, so this runs correctly whether or not the host binary
/// carries cap_net_raw (it does on Kali, may not elsewhere).
@Injectable()
export class NmapToolRunner implements ToolRunner {
  readonly tool = 'NMAP' as const;
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
    const bin = this.configService.get('RECON_TOOL_BIN_NMAP', { infer: true });
    return this.spawner.spawn({
      command: bin,
      args: ['-Pn', '--top-ports', '100', '-oX', '-', ctx.target.value],
      signal: ctx.signal,
      onStderrLine: (line) => ctx.onLog('WARN', line