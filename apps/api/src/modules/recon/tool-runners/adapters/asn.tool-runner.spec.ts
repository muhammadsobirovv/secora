import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { AsnToolRunner } from './asn.tool-runner.js';
import type { ToolProcessSpawner } from '../process/spawn-tool-process.util.js';
import type { EnvConfig } from '../../../../config/env.validation.js';

describe('AsnToolRunner', () => {
  it('declares its tool identity and supported target types', () => {
    const spawner = {
      spawn: jest.fn(),
    } as unknown as jest.Mocked<ToolProcessSpawner>;
    const configService = { get: jest.fn() } as unknown as jest.Mocked<
      ConfigService<EnvConfig, true>
    >;
    const runner = new AsnToolRunner(configService, spawner);
    expect(runner.tool).toBe('ASN');
    expect(runner.supportedTargetTypes).toEqual(['IP_ADDRESS']);
  });

  it('queries the configured Cymru whois host with a verbose query string', async () => {
    const spawner = {
      spawn: jest
        .fn<ToolProcessSpawner['spawn']>()
        .mockResolvedValue({ exitCode: 0, stdout: '', timedOut: false }),
    } as unknown as jest.Mocked<ToolProcessSpawner>;
    const configService = {
      get: jest.fn((key: string) =>
        key === 'RECON_TOOL_BIN_WHOIS' ? 'whois' : 'whois.cymru.com',
      ),
    } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;
    const runner = new AsnToolRunner(configService, spawner);

    await runner.run({
      target: { id: 't1', type: 'IP_ADDRESS', value: '8.8.8.8' },
      job: { id: 'job-1', timeoutSeconds: 60 },
      signal: new AbortController().signal,
      onLog: jest.fn(),
    });

    expect(configService.get).toHaveBeenCalledWith('RECON_TOOL_BIN_WHOIS', {
      infer: true,
    });
    expect(configService.get).toHaveBeenCalledWith(
      'RECON_TOOL_ASN_WHOIS_HOST',
      {
        infer: true,
      },
    );
    const call = spawner.spawn.mock.calls[0][0];
    expect(call.command).toBe('whois');
    expect(call.args).toEqual(['-h', 'whois.cymru.com', ' -v 8.8.8.8']);
  });
});
