import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { NiktoScannerRunner } from './nikto.scanner-runner.js';
import type { ScannerProcessSpawner } from '../process/spawn-scanner-process.util.js';
import type { EnvConfig } from '../../../../config/env.validation.js';

describe('NiktoScannerRunner', () => {
  it('declares its scanner identity and supported target types', () => {
    const spawner = {
      spawn: jest.fn(),
    } as unknown as jest.Mocked<ScannerProcessSpawner>;
    const configService = { get: jest.fn() } as unknown as jest.Mocked<
      ConfigService<EnvConfig, true>
    >;
    const runner = new NiktoScannerRunner(configService, spawner);
    expect(runner.scanner).toBe('NIKTO');
    expect(runner.supportedTargetTypes).toEqual([
      'URL',
      'DOMAIN',
      'SUBDOMAIN',
      'IP_ADDRESS',
    ]);
  });

  it('spawns nikto requesting XML to stdout', async () => {
    const spawner = {
      spawn: jest
        .fn<ScannerProcessSpawner['spawn']>()
        .mockResolvedValue({ exitCode: 0, stdout: '', timedOut: false }),
    } as unknown as jest.Mocked<ScannerProcessSpawner>;
    const configService = {
      get: jest.fn(() => 'nikto'),
    } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;
    const runner = new NiktoScannerRunner(configService, spawner);

    await runner.run({
      target: { id: 't1', type: 'DOMAIN', value: 'example.com' },
      job: { id: 'job-1', timeoutSeconds: 60 },
      config: null,
      signal: new AbortController().signal,
      onLog: jest.fn(),
    });

    expect(configService.get).toHaveBeenCalledWith('VULN_TOOL_BIN_NIKTO', {
      infer: true,
    });
    const call = spawner.spawn.mock.calls[0][0];
    expect(call.command).toBe('nikto');
    expect(call.args).toEqual([
      '-h',
      'example.com',
      '-Format',
      'xml',
      '-output',
      '-',
    ]);
  });
});
