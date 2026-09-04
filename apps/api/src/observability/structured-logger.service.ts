import { LoggerService, LogLevel } from '@nestjs/common';
import { getRequestId } from './request-context.js';
import { redactSensitiveData } from './log-redaction.util.js';

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
  /// Module 14 — `LOG_FORMAT` (env.validation.ts): `'json'` (default,
  /// the format described in this class's own doc comment above) or
  /// `'pretty'` — a single-line, human-scannable format for local
  /// development, where a person reading a terminal benefits more from
  /// readability than a log aggregator's ingestion format does. Every
  /// other behavior (level filtering, correlation ids, stderr/stdout
  /// routing) is identical between the two formats.
  private readonly pretty: boolean;
  /// Module 18 — task #506 (Structured logging + secret redaction). Which
  /// OS process emitted this line — `'api'` (main.ts, HTTP requests) or
  /// `'worker'` (worker.main.ts, background job execution). Both
  /// processes read the same database and can interleave in a shared log
  /// aggregator; without this, a worker-process crash-recovery log line
  /// was indistinguishable from an API-process one once shipped off-box.
  private readonly service: string;
  /// `NODE_ENV` at the moment this logger was constructed — included on
  /// every line so a log aggregator ingesting dev/staging/prod streams
  /// into one index can filter by environment without relying on
  /// per-index routing being configured correctly upstream.
  private readonly environment: string;

  constructor(
    configuredLogLevel = process.env.LOG_LEVEL ?? 'info',
    logFormat = process.env.LOG_FORMAT ?? 'json',
    service = 'api',
    environment = process.env.NODE_ENV ?? 'development',
  ) {
    this.threshold = LEVEL_RANK[mapConfiguredLevel(configuredLogLevel)];
    this.pretty = logFormat === 'pretty';
    this.service = service;
    this.environment = environment;
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

    const requestId = getRequestId();
    // Module 18 — task #506. Redact before this line ever reaches
    // JSON.stringify/renderPretty — message can be a plain object (some
    // call sites log `logger.log({event, userId, ...})` rather than a
    // string), and `rest`/optionalParams can be anything a caller passed,
    // including — accidentally — a DTO with a password/token field still
    // attached. See log-redaction.util.ts for the exact key list and
    // recursion behavior.
    const safeMessage =
      message instanceof Error
        ? message.message
        : typeof message === 'object' && message !== null
          ? redactSensitiveData(message)
          : message;
    const safeRest = rest.map((item) => redactSensitiveData(item));

    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      environment: this.environment,
      message: safeMessage,
      ...(message instanceof Error ? { stack: message.stack } : {}),
      ...(typeof context === 'string' ? { context } : {}),
      ...(requestId ? { requestId } : {}),
      ...(safeRest.length > 0 ? { details: safeRest } : {}),
    };

    const line = this.pretty ? this.renderPretty(entry) : JSON.stringify(entry);
    if (level === 'error' || level === 'fatal') {
      process.stderr.write(line + '\n');
    } else {
      process.stdout.write(line + '\n');
    }
  }

  /// `LOG_FORMAT=pretty` — one line, no JSON braces, everything a
  /// developer's eye needs in reading order:
  /// `HH:MM:SS LEVEL [context] [reqId] message {details}`.
  private renderPretty(entry: Record<string, unknown>): string {
    const time = String(entry.timestamp).slice(11, 19);
    const level = String(entry.level).toUpperCase().padEnd(7);
    const context = entry.context ? `[${String(entry.context)}] ` : '';
    const reqId = entry.requestId ? `[${String(entry.requestId).slice(0, 8)}] ` : '';
    const details = entry.details ? ` ${JSON.stringify(entry.details)}` : '';
    const stack = entry.stack ? `\n${String(entry.stack)}` : '';
    return `${time} ${level} ${context}${reqId}${String(entry.message)}${details}${stack}`;
  }
}
