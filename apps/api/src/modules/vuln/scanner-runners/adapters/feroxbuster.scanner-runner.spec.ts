import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { FeroxbusterScannerRunner } from './feroxbuster.scanner-runner.js';
import type { ScannerProcessSpawner } from '../process/spawn-scanner-process.util.js';
import type { EnvConfig } from '../../../../config/env.validation.js';

describe('FeroxbusterScannerRunner', () => {
  it('declares its scanner identity and supported target types', () => {
    const spawner = {
      spawn: jest.fn(),
    } as unknown as jest.Mocked<ScannerProcessSpawner>;
    const configService = { get: jest.fn() } as unknown as jest.Mocked<
      ConfigService<EnvConfig, true>
    >;
    const runner = new FeroxbusterScannerRunner(configService, spawner);
    expect(runner.scanner).toBe('FEROXBUSTER');
    expect(runner.supportedTargetTypes).toEqual(['URL']);
  });

  it('spawns feroxbuster with --json --silent --no-state', async () => {
    const spawner = {
      spawn: jest
        .fn<ScannerProcessSpawner['spawn']>()
        .mockResolvedValue({ exitCode: 0, stdout: '', timedOut: false }),
    } as unknown as jest.Mocked<ScannerProcessSpawner>;
    const configService = {
      get: jest.fn(() => 'feroxbuster'),
    } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;
    const runner = new FeroxbusterScannerRunner(configService, spawner);

    await runner.run({
      target: { id: 't1', type: 'URL', value: 'https://example.com' },
      job: { id: 'job-1', timeoutSeconds: 60 },
      config: null,
      signal: new AbortController().signal,
      onLog: jest.fn(),
    });

    const call = spawner.spawn.mock.calls[0][0];
    expect(call.command).toBe('feroxbuster');
    expect(call.args).toEqual([
      '-u',
      'https://example.com',
      '--json',
      '--silent',
      '--no-state',
    ]);
  });

  it('appends -w/-x/-d from job config', async () => {
    const spawner = {
      spawn: jest
        .fn<ScannerProcessSpawner['spawn']>()
        .mockResolvedValue({ exitCode: 0, stdout: '', timedOut: false }),
    } as unknown as jest.Mocked<ScannerProcessSpawner>;
    const configService = {
      get: jest.fn(() => 'feroxbuster'),
    } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;
    const runner = new FeroxbusterScannerRunner(configService, spawner);

    await runner.run({
      target: { id: 't1', type: 'URL', value: 'https://example.com' },
      job: { id: 'job-1', timeoutSeconds: 60 },
      config: {
        FEROXBUSTER: { wordlist: '/w.txt', extensions: ['php'], depth: 2 },
      },
      signal: new AbortController().signal,
      onLog: jest.fn(),
    });

    const call = spawner.spawn.mock.calls[0][0];
    expect(call.args).toEqual([
      '-u',
      'https://example.com',
      '--json',
      '--silent',
      '--no-state',
      '-w',
      '/w.txt',
      '-x',
      'php',
      '-d',
      '2',
    ]);
  });
});
