import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { FfufScannerRunner } from './ffuf.scanner-runner.js';
import type { ScannerProcessSpawner } from '../process/spawn-scanner-process.util.js';
import type { EnvConfig } from '../../../../config/env.validation.js';

describe('FfufScannerRunner', () => {
  it('declares its scanner identity and supported target types', () => {
    const spawner = {
      spawn: jest.fn(),
    } as unknown as jest.Mocked<ScannerProcessSpawner>;
    const configService = { get: jest.fn() } as unknown as jest.Mocked<
      ConfigService<EnvConfig, true>
    >;
    const runner = new FfufScannerRunner(configService, spawner);
    expect(runner.scanner).toBe('FFUF');
    expect(runner.supportedTargetTypes).toEqual(['URL']);
  });

  it('appends FUZZ to the target URL and writes JSON to /dev/stdout', async () => {
    const spawner = {
      spawn: jest
        .fn<ScannerProcessSpawner['spawn']>()
        .mockResolvedValue({ exitCode: 0, stdout: '', timedOut: false }),
    } as unknown as jest.Mocked<ScannerProcessSpawner>;
    const configService = {
      get: jest.fn((key: string) =>
        key === 'VULN_TOOL_BIN_FFUF' ? 'ffuf' : '/wordlists/common.txt',
      ),
    } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;
    const runner = new FfufScannerRunner(configService, spawner);

    await runner.run({
      target: { id: 't1', type: 'URL', value: 'https://example.com/' },
      job: { id: 'job-1', timeoutSeconds: 60 },
      config: null,
      signal: new AbortController().signal,
      onLog: jest.fn(),
    });

    const call = spawner.spawn.mock.calls[0][0];
    expect(call.command).toBe('ffuf');
    expect(call.args).toEqual([
      '-u',
      'https://example.com/FUZZ',
      '-w',
      '/wordlists/common.txt',
      '-of',
      'json',
      '-o',
      '/dev/stdout',
      '-s',
    ]);
  });

  it('prefers a per-job wordlist override and appends extensions/match-codes', async () => {
    const spawner = {
      spawn: jest
        .fn<ScannerProcessSpawner['spawn']>()
        .mockResolvedValue({ exitCode: 0, stdout: '', timedOut: false }),
    } as unknown as jest.Mocked<ScannerProcessSpawner>;
    const configService = {
      get: jest.fn(() => 'ffuf'),
    } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;
    const runner = new FfufScannerRunner(configService, spawner);

    await runner.run({
      target: { id: 't1', type: 'URL', value: 'https://example.com' },
      job: { id: 'job-1', timeoutSeconds: 60 },
      config: {
        FFUF: {
          wordlist: '/custom.txt',
          extensions: ['php', 'html'],
          matchCodes: '200,301',
        },
      },
      signal: new AbortController().signal,
      onLog: jest.fn(),
    });

    const call = spawner.spawn.mock.calls[0][0];
    expect(call.args).toContain('/custom.txt');
    expect(call.args).toEqual(
      expect.arrayContaining(['-e', 'php,html', '-mc', '200,301']),
    );
  });
});
