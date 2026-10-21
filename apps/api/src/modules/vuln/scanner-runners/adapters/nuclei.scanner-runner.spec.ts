import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { NucleiScannerRunner } from './nuclei.scanner-runner.js';
import type { ScannerProcessSpawner } from '../process/spawn-scanner-process.util.js';
import type { EnvConfig } from '../../../../config/env.validation.js';

describe('NucleiScannerRunner', () => {
  it('declares its scanner identity and supported target types', () => {
    const spawner = {
      spawn: jest.fn(),
    } as unknown as jest.Mocked<ScannerProcessSpawner>;
    const configService = { get: jest.fn() } as unknown as jest.Mocked<
      ConfigService<EnvConfig, true>
    >;
    const runner = new NucleiScannerRunner(configService, spawner);
    expect(runner.scanner).toBe('NUCLEI');
    expect(runner.supportedTargetTypes).toEqual([
      'URL',
      'DOMAIN',
      'SUBDOMAIN',
      'IP_ADDRESS',
    ]);
  });

  it('spawns nuclei with -jsonl and appends severity/tags/templates from job config', async () => {
    const spawner = {
      spawn: jest
        .fn<ScannerProcessSpawner['spawn']>()
        .mockResolvedValue({ exitCode: 0, stdout: '', timedOut: false }),
    } as unknown as jest.Mocked<ScannerProcessSpawner>;
    const configService = {
      get: jest.fn(() => 'nuclei'),
    } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;
    const runner = new NucleiScannerRunner(configService, spawner);

    await runner.run({
      target: { id: 't1', type: 'URL', value: 'https://example.com' },
      job: { id: 'job-1', timeoutSeconds: 60 },
      config: { NUCLEI: { severity: ['high', 'critical'], tags: ['cve'] } },
      signal: new AbortController().signal,
      onLog: jest.fn(),
    });

    expect(configService.get).toHaveBeenCalledWith('VULN_TOOL_BIN_NUCLEI', {
      infer: true,
    });
    const call = spawner.spawn.mock.calls[0][0];
    expect(call.command).toBe('nuclei');
    expect(call.args).toEqual([
      '-u',
      'https://example.com',
      '-jsonl',
      '-no-color',
      '-stats',
      '-stats-interval',
      '5',
      '-ni',
      '-duc',
      '-rl',
      '30',
      '-timeout',
      '10',
      '-retries',
      '1',
      '-lna',
      '-ept',
      'code,file,headless,javascript,websocket,whois',
      '-tags',
      'cve',
      '-severity',
      'high,critical',
    ]);
  });

  it('also probes a domain target over https so HTTP templates run', async () => {
    const spawner = {
      spawn: jest
        .fn<ScannerProcessSpawner['spawn']>()
        .mockResolvedValue({ exitCode: 0, stdout: '', timedOut: false }),
    } as unknown as jest.Mocked<ScannerProcessSpawner>;
    const configService = {
      get: jest.fn(() => 'nuclei'),
    } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;
    const runner = new NucleiScannerRunner(configService, spawner);

    await runner.run({
      target: { id: 't1', type: 'DOMAIN', value: 'example.com' },
      job: { id: 'job-1', timeoutSeconds: 60 },
      config: null,
      signal: new AbortController().signal,
      onLog: jest.fn(),
    });

    const call = spawner.spawn.mock.calls[0][0];
    expect(call.args.slice(0, 4)).toEqual([
      '-u',
      'example.com',
      '-u',
      'https://example.com',
    ]);
  });

  it('turns nuclei output into readable log lines', async () => {
    const spawner = {
      spawn: jest
        .fn<ScannerProcessSpawner['spawn']>()
        .mockResolvedValue({ exitCode: 0, stdout: '', timedOut: false }),
    } as unknown as jest.Mocked<ScannerProcessSpawner>;
    const configService = {
      get: jest.fn(() => 'nuclei'),
    } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;
    const runner = new NucleiScannerRunner(configService, spawner);
    const onLog = jest.fn();

    await runner.run({
      target: { id: 't1', type: 'URL', value: 'https://example.com' },
      job: { id: 'job-1', timeoutSeconds: 60 },
      config: null,
      signal: new AbortController().signal,
      onLog,
    });

    const call = spawner.spawn.mock.calls[0][0];
    onLog.mockClear();

    call.onStdoutLine?.(
      JSON.stringify({
        'template-id': 'exposed-env',
        'matched-at': 'https://example.com/.env',
        info: { name: 'Exposed .env', severity: 'high' },
      }),
    );
    call.onStdoutLine?.('not json');
    call.onStderrLine?.('[INF] Templates loaded for current scan: 8000');
    call.onStderrLine?.('[ERR] Could not read template');
    call.onStderrLine?.('   ___  banner art');

    expect(onLog).toHaveBeenCalledTimes(3);
    expect(onLog).toHaveBeenNthCalledWith(
      1,
      'ERROR',
      'FOUND [high] Exposed .env (exposed-env) -> https://example.com/.env',
    );
    expect(onLog).toHaveBeenNthCalledWith(
      2,
      'INFO',
      '[INF] Templates loaded for current scan: 8000',
    );
    expect(onLog).toHaveBeenNthCalledWith(
      3,
      'ERROR',
      '[ERR] Could not read template',
    );
  });

  it('runs with no extra flags when no scanner config is supplied', async () => {
    const spawner = {
      spawn: jest
        .fn<ScannerProcessSpawner['spawn']>()
        .mockResolvedValue({ exitCode: 0, stdout: '', timedOut: false }),
    } as unknown as jest.Mocked<ScannerProcessSpawner>;
    const configService = {
      get: jest.fn(() => 'nuclei'),
    } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;
    const runner = new NucleiScannerRunner(configService, spawner);

    await runner.run({
      target: { id: 't1', type: 'URL', value: 'https://example.com' },
      job: { id: 'job-1', timeoutSeconds: 60 },
      config: null,
      signal: new AbortController().signal,
      onLog: jest.fn(),
    });

    const call = spawner.spawn.mock.calls[0][0];
    // Hardened defaults from the tool catalog: no interactsh callbacks (-ni),
    // no update check (-duc), rate limit and timeouts always set.
    expect(call.args).toEqual([
      '-u',
      'https://example.com',
      '-jsonl',
      '-no-color',
      '-stats',
      '-stats-interval',
      '5',
      '-ni',
      '-duc',
      '-rl',
      '30',
      '-timeout',
      '10',
      '-retries',
      '1',
      '-lna',
      '-ept',
      'code,file,headless,javascript,websocket,whois',
    ]);
  });
});
