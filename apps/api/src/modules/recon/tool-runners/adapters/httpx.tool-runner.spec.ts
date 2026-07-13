import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { HttpxToolRunner } from './httpx.tool-runner.js';
import type { ToolProcessSpawner } from '../process/spawn-tool-process.util.js';
import type { EnvConfig } from '../../../../config/env.validation.js';

describe('HttpxToolRunner', () => {
  it('declares its tool identity and supported target types', () => {
    const spawner = {
      spawn: jest.fn(),
    } as unknown as jest.Mocked<ToolProcessSpawner>;
    const configService = { get: jest.fn() } as unknown as jest.Mocked<
      ConfigService<EnvConfig, true>
    >;
    const runner = new HttpxToolRunner(configService, spawner);
    expect(runner.tool).toBe('HTTPX');
    expect(runner.supportedTargetTypes).toEqual(['URL', 'DOMAIN', 'SUBDOMAIN']);
  });

  it('uses the httpx-toolkit binary name, not plain "httpx" (Kali PATH collision)', async () => {
    const spawner = {
      spawn: jest
        .fn<ToolProcessSpawner['spawn']>()
        .mockResolvedValue({ exitCode: 0, stdout: '', timedOut: false }),
    } as unknown as jest.Mocked<ToolProcessSpawner>;
    const configService = {
      get: jest.fn().mockReturnValue('httpx-toolkit'),
    } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;
    const runner = new HttpxToolRunner(configService, spawner);

    await runner.run({
      target: { id: 't1', type: 'URL', value: 'https://example.com/$(id)' },
      job: { id: 'job-1', timeoutSeconds: 60 },
      signal: new AbortController().signal,
      onLog: jest.fn(),
    });

    expect(configService.get).toHaveBeenCalledWith('RECON_TOOL_BIN_HTTPX', {
      infer: true,
    });
    const call = spawner.spawn.mock.calls[0][0];
    expect(call.command).toBe('httpx-toolkit');
    expect(Array.isArray(call.args)).toBe(true);
    expect(call.args.filter((a) => a.includes('$(id)'))).toHaveLength(1);
  });
});
