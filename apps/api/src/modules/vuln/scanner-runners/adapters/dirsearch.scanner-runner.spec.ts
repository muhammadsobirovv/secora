import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { DirsearchScannerRunner } from './dirsearch.scanner-runner.js';
import type { ScannerProcessSpawner } from '../process/spawn-scanner-process.util.js';
import type { EnvConfig } from '../../../../config/env.validation.js';

describe('DirsearchScannerRunner', () => {
  it('declares its scanner identity and supported target types', () => {
    const spawner = {
      spawn: jest.fn(),
    } as unknown as jest.Mocked<ScannerProcessSpawner>;
    const configService = { get: jest.fn() } as unknown as jest.Mocked<
      ConfigService<EnvConfig, true>
    >;
    const runner = new DirsearchScannerRunner(configService, spawner);
    expect(runner.scanner).toBe('DIRSEARCH');
    expect(runner.supportedTargetTypes).toEqual(['URL']);
  });

  it('spawns dirsearch with -u/--quiet and no JSON output flag', async () => {
    const spawner = {
      spawn: jest
        .fn<ScannerProcessSpawner['spawn']>()
        .mockResolvedValue({ exitCode: 0, stdout: '', timedOut: false }),
    } as unknown as jest.Mocked<ScannerProcessSpawner>;
    const configService = {
      get: jest.fn(() => 'dirsearch'),
    } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;
    const runner = new DirsearchScannerRunner(configService, spawner);

    await runner.run({
      target: { id: 't1', type: 'URL', value: 'https://example.com' },
      job: { id: 'job-1', timeoutSeconds: 60 },
      config: null,
      signal: new AbortController().signal,
      onLog: jest.fn(),
    });

    const call = spawner.spawn.mock.calls[0][0];
    expect(call.command).toBe('dirsearch');
    expect(call.args).toEqual(['-u', 'https://example.com', '--quiet']);
  });

  it('appends -w/-e from job config', async () => {
    const spawner = {
      spawn: jest
        .fn<ScannerProcessSpawner['spawn']>()
        .mockResolvedValue({ exitCode: 0, stdout: '', timedOut: false }),
    } as unknown as jest.Mocked<ScannerProcessSpawner>;
    const configService = {
      get: jest.fn(() => 'dirsearch'),
    } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;
    const runner = new DirsearchScannerRunner(configService, spawner);

    await runner.run({
      target: { id: 't1', type: 'URL', value: 'https://example.com' },
      job: { id: 'job-1', timeoutSeconds: 60 },
      config: { DIRSEARCH: { wordlist: '/w.txt', extensions: ['php'] } },
      signal: new AbortController().signal,
      onLog: jest.fn(),
    });

    const call = spawner.spawn.mock.calls[0][0];
    expect(call.args).toEqual([
      '-u',
      'https://example.com',
      '--quiet',
      '-w',
      '/w.txt',
      '-e',
      'php',
    ]);
  });
});
