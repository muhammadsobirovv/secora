import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { GauToolRunner } from './gau.tool-runner.js';
import type { ToolProcessSpawner } from '../process/spawn-tool-process.util.js';
import type { EnvConfig } from '../../../../config/env.validation.js';

describe('GauToolRunner', () => {
  it('declares its tool identity and supported target types', () => {
    const spawner = {
      spawn: jest.fn(),
    } as unknown as jest.Mocked<ToolProcessSpawner>;
    const configService = { get: jest.fn() } as unknown as jest.Mocked<
      ConfigService<EnvConfig, true>
    >;
    const runner = new GauToolRunner(configService, spawner);
    expect(runner.tool).toBe('GAU');
    expect(runner.supportedTargetTypes).toEqual(['DOMAIN', 'SUBDOMAIN']);
  });

  it('passes the target value as the sole positional argv element', async () => {
    const spawner = {
      spawn: jest
        .fn<ToolProcessSpawner['spawn']>()
        .mockResolvedValue({ exitCode: 0, stdout: '', timedOut: false }),
    } as unknown as jest.Mocked<ToolProcessSpawner>;
    const configService = {
      get: jest.fn().mockReturnValue('gau'),
    } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;
    const runner = new GauToolRunner(configService, spawner);

    await runner.run({
      target: { id: 't1', type: 'DOMAIN', value: 'example.com`whoami`' },
      job: { id: 'job-1', timeoutSeconds: 60 },
      signal: new AbortController().signal,
      onLog: jest.fn(),
    });

    expect(configService.get).toHaveBeenCalledWith('RECON_TOOL_BIN_GAU', {
      infer: true,
    });
    const call = spawner.spawn.mock.calls[0][0];
    expect(call.args).toEqual(['example.com`whoami`'])