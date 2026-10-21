import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../../config/env.validation.js';
import { ScannerProcessSpawner } from '../process/spawn-scanner-process.util.js';
import type {
  ScannerRunContext,
  ScannerRunner,
  ScannerRunResult,
} from '../scanner-runner.interface.js';
import type { TargetType } from '../../../../prisma-types.js';
import {
  buildNucleiArgs,
  type ScanProfile,
} from '../../pipeline/tool-catalog.js';
import type { PinnedHost } from '../../pipeline/pin.util.js';
import { redactArgv } from '../../pipeline/redact-argv.util.js';

interface NucleiConfig {
  profile?: ScanProfile;
  /// Set by the pipeline: connect to this IP, send the real name as Host.
  pin?: PinnedHost;
  /// Live URLs on the pinned host found by the recon stage.
  urls?: string[];
  severity?: string[];
  tags?: string[];
  templates?: string[];
}

/// Nuclei is the canonical template-matching scanner: it resolves+probes a
/// bare host itself (unlike the pure content-discovery fuzzers below), so
/// it accepts every target type the platform has an HTTP-adjacent notion
/// of. -jsonl streams one JSON object per match to stdout — no file
/// round-trip needed, unlike gowitness in Module 3.
@Injectable()
export class NucleiScannerRunner implements ScannerRunner {
  readonly scanner = 'NUCLEI' as const;
  readonly supportedTargetTypes: TargetType[] = [
    'URL',
    'DOMAIN',
    'SUBDOMAIN',
    'IP_ADDRESS',
  ];

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly spawner: ScannerProcessSpawner,
  ) {}

  run(ctx: ScannerRunContext): Promise<ScannerRunResult> {
    const bin = this.configService.get('VULN_TOOL_BIN_NUCLEI', {
      infer: true,
    });
    const config = (ctx.config?.NUCLEI ?? {}) as NucleiConfig;

    // IP targets cannot prove ownership (no DNS or web identity), so they are
    // never scanned. The gate refuses them earlier; this is the second lock.
    if (ctx.target.type === 'IP_ADDRESS' || ctx.target.type === 'CIDR') {
      return Promise.reject(
        new Error('IP targets cannot be verified and are not scanned.'),
      );
    }

    // The tool catalog builds the argv: it is the single source for nuclei's
    // flags (rate limit, no interactsh callbacks, profile tag ceiling). A
    // domain becomes both host and https:// form inside the builder.
    const args = buildNucleiArgs({
      target: {
        kind: ctx.target.type as 'URL' | 'DOMAIN' | 'SUBDOMAIN',
        value: ctx.target.value,
      },
      profile: config.profile,
      severity: config.severity,
      tags: config.tags,
      templates: config.templates,
      pin: config.pin,
      urls: config.urls,
      templatesDir: this.configService.get('VULN_NUCLEI_TEMPLATES_DIR', {
        infer: true,
      }),
      // Private-network connections stay blocked unless the operator opted in
      // to private targets (dev/lab only; the env validation refuses it in production).
      restrictLocalNetwork:
        this.configService.get('ACTIVE_SCAN_ALLOW_PRIVATE_TARGETS', {
          infer: true,
        }) !== true,
    });

    // A pinned run prints the IP in its output; show the real hostname.
    const unpin = (text: string): string =>
      config.pin ? text.split(config.pin.ip).join(config.pin.host) : text;

    ctx.onLog('INFO', `$ ${bin} ${redactArgv(args).join(' ')}`);
    ctx.onCommand?.({ tool: 'nuclei', command: bin, argv: args });

    return this.spawner.spawn({
      command: bin,
      args,
      signal: ctx.signal,
      onStdoutLine: (line) => {
        const match = describeMatch(unpin(line));
        if (match) ctx.onLog(match.level, match.message);
      },
      onStderrLine: (line) => {
        const entry = describeProgressLine(unpin(line));
        if (entry) ctx.onLog(entry.level, entry.message);
      },
    });
  }
}

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface NucleiMatchLine {
  'template-id'?: string;
  'matched-at'?: string;
  host?: string;
  info?: { severity?: string; name?: string };
}

/// One JSONL match -> one readable terminal line, coloured by severity.
/// Anything on stdout that is not a match (e.g. a stats line) is ignored here.
function describeMatch(
  line: string,
): { level: LogLevel; message: string } | null {
  let parsed: NucleiMatchLine;
  try {
    parsed = JSON.parse(line) as NucleiMatchLine;
  } catch {
    return null;
  }
  const templateId = parsed['template-id'];
  if (!templateId) return null;
  const severity = (parsed.info?.severity ?? 'info').toLowerCase();
  const where = parsed['matched-at'] ?? parsed.host ?? '';
  const level: LogLevel =
    severity === 'critical' || severity === 'high'
      ? 'ERROR'
      : severity === 'medium'
        ? 'WARN'
        : 'INFO';
  return {
    level,
    message: `FOUND [${severity}] ${parsed.info?.name ?? templateId} (${templateId})${where ? ` -> ${where}` : ''}`,
  };
}

/// nuclei writes its own log lines ("[INF] ...", "[WRN] ...", periodic stats
/// that start with "[0:00:05]") to stderr. The ASCII banner and blank lines
/// are dropped; everything else keeps its level.
function describeProgressLine(
  line: string,
): { level: LogLevel; message: string } | null {
  const text = line.trim();
  if (!text.startsWith('[')) return null;
  if (/^\[(ERR|FTL)\]/.test(text)) return { level: 'ERROR', message: text };
  if (/^\[WRN\]/.test(text)) return { level: 'WARN', message: text };
  return { level: 'INFO', message: text };
}
