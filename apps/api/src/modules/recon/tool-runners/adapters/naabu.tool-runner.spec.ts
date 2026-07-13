import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { NaabuToolRunner } from './naabu.tool-runner.js';
import type { ToolProcessSpawner } from '../process/spawn-tool-process.util.js';
import type { EnvConfig } from '../../../../config/env.validation.js';

describe('NaabuToolRunner', () => {
  it('declares its tool identity and supported target types', () => {
    const spawner = {
      spawn: jest.fn(),
    } as unknown as jest.Mocked<ToolProcessSpawner>;
    const configService = { get: jest.fn() } as unknown as jest.Mocked<
      ConfigService<EnvConfig, true>
    >;
    const runner = new NaabuToolRunner(configService, spawner);
    expect(runner.tool).toBe('NAABU');
    expect(runner.supportedTargetTypes).toEqual(
      expect.arrayContaining(['IP_ADDRESS', 'CIDR', 'DOMAIN', 'SUBDOMAIN']),
    );
  });

  it('spawns with an argv array containing the target value as one element', async () => {
    const spawner = {
      spawn: jest
        .fn<ToolProcessSpawner['spawn']>()
        .mockResolvedValue({ exitCode: 0, stdout: '', timedOut: false }),
    } as unknown as jest.Mocked<ToolProcessSpawner>;
    const configService = {
      get: jest.fn().mockReturnValue('naabu'),
    } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;
    const runner = new NaabuToolRunner(configService, spawner);

    await runner.run({
      target: {
        id: 't1',
        type: 'IP_ADDRESS',
        value: '10.0.0.1; nc -e /bin/sh',
      },
      job: { id: 'job-1', timeoutSeconds: 60 },
      signal: new AbortController().signal,
      onLog: jest.fn(),
    });

    expect(configService.get).toHaveBeenCalledWith('RECON_TOOL_BIN_NAABU', {
      infer: true,
    });
    const call = spawner.spawn.mock.calls[0][0];
    expect(Array.isArray(call.args)).toBe(true);
    expect(call.args.filter((a) => a.includes('nc -e'))).toHaveLength(1);
    expect(call.command).toBe('naabu');
  });
});
