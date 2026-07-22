import { LoggerService, LogLevel } from '@nestjs/common';

/// A single-file, dependency-free structured logger implementing
/// NestJS's `LoggerService` interface, passed to `NestFactory.create`
/// so it replaces Nest's default pretty-printed console logger
/// app-wide. Emits one JSON object per line
/// (`{timestamp, level, message, context, ...}`) — the format every log
/// aggregator (CloudWatch Logs, Datadog, ELK/Loki, GCP Cloud Logging)
/// ingests natively without a separate log-shipper parsing regex,
/// unlike Nest's default colorized human-readable format. Deliberately
/// not `pino`/`winston` (both fine, well-established choices) — this
/// project's established pattern throughout Module 9/10 is to avoid
/// adding a new dependency that can't be `pnpm install`-verified in this
/// sandbox when a straightforward hand-written implementation covers
/// the actual requirement (structured, leveled, JSON-lines output)
/// completely.
///
/// Honors `LOG_LEVEL` (env.validation.ts) — a level below the
/// configured threshold is a no-op, avoiding the cost of even
/// stringifying `optionalParams` for filtered-out log lines.
const LEVEL_RANK: Record<LogLevel, number> = {
  fatal: 0,
  error: 1,
  warn: 2,
  log: 3, // NestJS's own default "info-equivalent" level name.
  debug: 4,
  verbose: 5,
};

// env.validation.ts's LOG_LEVEL uses the more conventional 'info'/'trace'
// naming; NestJS's LogLevel type uses 'log'/'verbose' for the same
// concepts — this maps between the two vocabularies once, here.
function mapConfiguredLevel(level: string): LogLevel {
  switch (level) {
    case 'fatal':
      return 'fatal';
    case 'error':
      return 'error';
    case 'warn':
      return 'warn';
    case 'info':
      return 'log';
    case 'debug':
      return 'debug';
    case 'trace':
      return 'verbose';
    default:
      return 'log';
  }
}

export class StructuredLoggerService implements LoggerService {
  private readonly threshold: number;

  constructor(configuredLogLevel = process.env.LOG_LEVEL ?? 'info') {
    this.threshold = LEVEL_RANK[mapConfiguredLevel(configuredLogLevel)];
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('log', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('verbose', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('fatal', message, optionalParams);
  }

  private write(level: LogLevel, message: unknown, optionalParams: unknown[]): void {
    if (LEVEL_RANK[level] > this.threshold) return;

    // Nest's convention: the LAST optionalParam is the "context" (e.g.
    // the class name) when logging from within a NestJS-managed class;
    // an error's stack trace, when present, is typically the first
    // optionalParam for `.error()` calls.
    const context = optionalParams.length > 0 ? optionalParams[optionalParams.length - 1] : undefined;
    const rest = optionalParams.length > 0 ? optionalParams.slice(0, -1) : [];

    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      message: message instanceof Error ? message.message : message,
      ...(message instanceof Error ? { stack: message.stack } : {}),
      ...(typeof context === 'string' ? { context } : {}),
      ...(rest.length > 0 ? { details: rest } : {}),
    };

    const line = JSON.stringify(entry);
    if (level === 'error' || level === 'fatal') {
      process.stderr.write(line + '\n');
    } else {
      process.stdout.write(line + '\n');
    }
  }
}
