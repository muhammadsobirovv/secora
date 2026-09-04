import { describe, expect, it, jest, afterEach } from '@jest/globals';
import { StructuredLoggerService } from './structured-logger.service.js';

/// Module 18 — task #506 (Structured logging + secret redaction).
/// `StructuredLoggerService` writes directly to process.stdout/stderr
/// (not console.log), so these tests spy on those streams' `.write()` and
/// parse the JSON line it wrote, rather than mocking `console`.

function captureWrites() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    stdout.push(String(chunk));
    return true;
  });
  const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    stderr.push(String(chunk));
    return true;
  });
  return { stdout, stderr, restore: () => { stdoutSpy.mockRestore(); stderrSpy.mockRestore(); } };
}

describe('StructuredLoggerService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('includes service, environment, level, and timestamp on every line', () => {
    const capture = captureWrites();
    const logger = new StructuredLoggerService('info', 'json', 'worker', 'production');

    logger.log('job started');

    const entry = JSON.parse(capture.stdout[0]) as Record<string, unknown>;
    expect(entry.service).toBe('worker');
    expect(entry.environment).toBe('production');
    expect(entry.level).toBe('log');
    expect(entry.message).toBe('job started');
    expect(typeof entry.timestamp).toBe('string');
    capture.restore();
  });

  it('defaults service to "api" when not specified', () => {
    const capture = captureWrites();
    const logger = new StructuredLoggerService('info', 'json');

    logger.log('hello');

    const entry = JSON.parse(capture.stdout[0]) as Record<string, unknown>;
    expect(entry.service).toBe('api');
    capture.restore();
  });

  it('routes error/fatal to stderr and log/warn/debug to stdout', () => {
    const capture = captureWrites();
    const logger = new StructuredLoggerService('trace', 'json');

    logger.log('a');
    logger.warn('b');
    logger.error('c');
    logger.fatal('d');

    expect(capture.stdout).toHaveLength(2);
    expect(capture.stderr).toHaveLength(2);
    capture.restore();
  });

  it('suppresses log lines below the configured threshold', () => {
    const capture = captureWrites();
    const logger = new StructuredLoggerService('warn', 'json'); // warn and above only

    logger.debug('should be suppressed');
    logger.log('should also be suppressed (log < warn)');
    logger.warn('should appear');

    expect(capture.stdout).toHaveLength(1);
    const entry = JSON.parse(capture.stdout[0]) as Record<string, unknown>;
    expect(entry.message).toBe('should appear');
    capture.restore();
  });

  describe('secret redaction (task #506)', () => {
    it('redacts a sensitive field inside an object passed as the log message itself', () => {
      const capture = captureWrites();
      const logger = new StructuredLoggerService('info', 'json');

      logger.log({ event: 'user.login', email: 'a@b.com', password: 'hunter2' });

      const entry = JSON.parse(capture.stdout[0]) as { message: Record<string, unknown> };
      expect(entry.message.email).toBe('a@b.com');
      expect(entry.message.password).toBe('[REDACTED]');
      expect(JSON.stringify(entry)).not.toContain('hunter2');
      capture.restore();
    });

    it('redacts a sensitive field inside an optionalParams object (the "details" array)', () => {
      const capture = captureWrites();
      const logger = new StructuredLoggerService('info', 'json');

      logger.log('AI provider request', { provider: 'openai', apiKey: 'sk-live-abc123' });

      const entry = JSON.parse(capture.stdout[0]) as { details: Array<Record<string, unknown>> };
      expect(entry.details[0].provider).toBe('openai');
      expect(entry.details[0].apiKey).toBe('[REDACTED]');
      expect(JSON.stringify(entry)).not.toContain('sk-live-abc123');
      capture.restore();
    });

    it('still surfaces an Error message and stack trace normally (not treated as a redaction target)', () => {
      const capture = captureWrites();
      const logger = new StructuredLoggerService('info', 'json');

      logger.error(new Error('boom'));

      const entry = JSON.parse(capture.stderr[0]) as Record<string, unknown>;
      expect(entry.message).toBe('boom');
      expect(typeof entry.stack).toBe('string');
      capture.restore();
    });
  });

  describe('requestId propagation', () => {
    it('omits requestId when no request context is active (unit test, no AsyncLocalStorage.run wrapper)', () => {
      const capture = captureWrites();
      const logger = new StructuredLoggerService('info', 'json');

      logger.log('no context here');

      const entry = JSON.parse(capture.stdout[0]) as Record<string, unknown>;
      expect('requestId' in entry).toBe(false);
      capture.restore();
    });
  });
});
