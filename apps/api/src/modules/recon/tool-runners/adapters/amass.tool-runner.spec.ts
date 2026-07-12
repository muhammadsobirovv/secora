import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { AmassToolRunner } from './amass.tool-runner.js';
import type { ToolProcessSpawner } from '../process/spawn-tool-process.util.js';
import type { EnvConfig } from '../../../../config/env.validation.js';

describe('AmassToolRunner', () => {
  it('declares its tool identity and supported target types', () => {
    const spawner = {
      spawn: jest.fn(),
    } as unknown as jest.Mocked<ToolProcessSpawner>;
    const configService = { get: jest.fn() } as unknown as jest.Mocked<
      ConfigService<EnvConfig, true>
    >;
    const runner = new AmassToolRunner(configService, spawner);
    expect(runner.tool).toBe('AMASS');
    expect(runner.supportedTargetTypes).toEqual(['DOMAIN']);
  });

  it('always runs in passive mode, never active', async () => {
    const spawner = {
      spawn: jest
        .fn<ToolProcessSpawner['spawn']>()
        .mockResolvedValue({ exitCode: 0, stdout: '', timedOut: false }),
    } as unknown as jest.Mocked<ToolProcessSpawner>;
    const configService = {
      get: jest.fn().mockReturnValue('amass'),
    } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;
    const runner = new AmassToolRunner(configService, spawner);
    const signal = new AbortController().signal;

    await runner.run({
      target: { id: 't1', type: 'DOMAIN', value: 'example.com' },
      job: { id: 'job-1', timeoutSeconds: 60 },
      signal,
      onLog: jest.fn(),
    });

    expect(configService.get).toHaveBeenCalledWith('RECON_TOOL_BIN_AMASS', {
      infer: true,
    });
    const call = spawner.spawn.mock.calls[0][0];
    expect(call.args).toContain('-passive');
    expect(call.args).not.toContain('-active');
    expect(call.args).toContain('example.com');
    expect(call.command).toBe('amass');
  });

  it('passes the target value as one argv element, never shell-interpolated', async () => {
    const spawner = {
      spawn: jest
        .fn<ToolProcessSpawner['spawn']>()
        .mockResolvedValue({ exitCode: 0, stdout: '', timedOut: false }),
    } as unknown as jest.Mocked<ToolProcessSpawner>;
    const configService = {
      get: jest.fn().mockReturnValue('amass'),
    } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;
    const runner = new AmassToolRunner(configService, spawner);

    await runner.run({
      target: { id: 't1', type: 'DOMAIN', value: 'example.com`whoami`' },
      job: { id: 'job-1', timeoutSeconds: 60 },
      signal: new AbortController().signal,
      onLog: jest.fn(),
    });

    const call = spawner.spawn.mock.calls[0][0];
    expect(Array.isArray(call.args)).toBe(true);
    expect(call.args.filter((a) => a