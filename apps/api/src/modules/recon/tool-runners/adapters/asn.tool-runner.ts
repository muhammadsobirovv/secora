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

/// IP-to-ASN lookup via Team Cymru's whois-based bulk lookup service
/// (whois.cymru.com) — reuses the same `whois` binary as WhoisToolRunner,
/// just pointed at a different host with a different query string, so no
/// separate CLI dependency is needed for ASN lookups. The Cymru protocol
/// expects the leading space in the query string (` -v <ip>`); `-v`
/// requests the verbose/named form (AS name included, not just the
/// number) — see https://team-cymru.com/community-services/ip-asn-mapping/.
@Injectable()
export class AsnToolRunner implements ToolRunner {
  readonly tool = 'ASN' as const;
  readonly supportedTargetTypes: TargetType[] = ['IP_ADDRESS'];

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly spawner: ToolProcessSpawner,
  ) {}

  run(ctx: ToolRunContext): Promise<ToolRunResult> {
    const bin = this.configService.get('RECON_TOOL_BIN_WHOIS', { infer: true });
    const host = this.configService.get('RECON_TOOL_ASN_WHOIS_HOST', {
      infer: true,
    });
    return this.spawner.spawn({
      command: bin,
      args: ['-h', host, ` -v ${ctx.target.value}`],
      signal: ctx.signal,
      onStderrLine: (lin