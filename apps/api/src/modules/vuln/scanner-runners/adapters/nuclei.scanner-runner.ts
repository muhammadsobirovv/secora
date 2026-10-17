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

interface NucleiConfig {
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

    // A bare domain is probed over DNS by nuclei, but its HTTP templates only
    // run when the input is a URL — so a domain/subdomain target is given as
    // both the host and its https:// form. That is what makes a quick scan of
    // "example.com" cover the website, not just its DNS records.
    const isHostTarget =
      ctx.target.type === 'DOMAIN' || ctx.target.type === 'SUBDOMAIN';
    const args = ['-u', ctx.target.value];
    if (isHostTarget) {
      args.push('-u', `https://${ctx.target.value}`);
    }
    // No -silent: nuclei's own progress lines (templates loaded, targets,
    // periodic stats) go to stderr and are what the live terminal shows.
    args.push('-jsonl', '-no-color', '-stats', '-stats-interval', '5');
    if (config.severity && config.severity.length > 0) {
      args.push('-severity', config.severity.join(','));
    }
    if (config.tags && config.tags.length > 0) {
      args.push('-tags', config.tags.join(','));
    }
    if (config.templates && config.templates.length > 0) {
      args.push('-templates', config.templates.join(','));
    }

    ctx.onLog('INFO', `$ ${bin} ${args.join(' ')}`);

    return this.spawner.spawn({
      command: bin,
      args,
      signal: ctx.signal,
      onStdoutLine: (line) => {
        const match = describeMatch(line);
        if (match) ctx.onLog(match.level, match.message);
      },
      onStderrLine: (line) => {
        const entry = describeProgressLine(line);
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
