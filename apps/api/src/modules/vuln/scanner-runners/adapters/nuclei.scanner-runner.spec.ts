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
      '-silent',
      '-no-color',
      '-severity',
      'high,critical',
      '-tags',
      'cve',
    ]);
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
    expect(call.args).toEqual([
      '-u',
      'https://example.com',
      '-jsonl',
      '-silent',
      '-no-color',
    ]);
  });
});
