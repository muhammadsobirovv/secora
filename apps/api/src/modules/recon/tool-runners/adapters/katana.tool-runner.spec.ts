import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { KatanaToolRunner } from './katana.tool-runner.js';
import type { ToolProcessSpawner } from '../process/spawn-tool-process.util.js';
import type { EnvConfig } from '../../../../config/env.validation.js';

describe('KatanaToolRunner', () => {
  it('declares its tool identity and supported target types', () => {
    const spawner = {
      spawn: jest.fn(),
    } as unknown as jest.Mocked<ToolProcessSpawner>;
    const configService = { get: jest.fn() } as unknown as jest.Mocked<
      ConfigService<EnvConfig, true>
    >;
    const runner = new KatanaToolRunner(configService, spawner);
    expect(runner.tool).toBe('KATANA');
    expect(runner.supportedTargetTypes).toEqual(['URL', 'DOMAIN', 'SUBDOMAIN']);
  });

  it('caps crawl depth at 2', async () => {
    const spawner = {
      spawn: jest
        .fn<ToolProcessSpawner['spawn']>()
        .mockResolvedValue({ exitCode: 0, stdout: '', timedOut: false }),
    } as unknown as jest.Mocked<ToolProcessSpawner>;
    const configService = {
      get: jest.fn().mockReturnValue('katana'),
    } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;
    const runner = new KatanaToolRunner(configService, spawner);

    await runner.run({
      target: { id: 't1', type: 'URL', value: 'https://example.com' },
      job: { id: 'job-1', timeoutSeconds: 60 },
      signal: new AbortController().signal,
      onLog: jest.fn(),
    });

    expect(configService.get).toHaveBeenCalledWith('RECON_TOOL_BIN_KATANA', {
      infer: true,
    });
    const call = spawner.spawn.mock.calls[0][0];
    expect(call.args).toEqual(
      expect.arrayContaining(['-depth', '2', '-u', 'https://example.com']),
    );
  });
});
