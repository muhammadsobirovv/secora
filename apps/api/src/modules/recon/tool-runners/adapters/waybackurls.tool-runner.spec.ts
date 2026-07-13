import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { WaybackurlsToolRunner } from './waybackurls.tool-runner.js';
import type { ToolProcessSpawner } from '../process/spawn-tool-process.util.js';
import type { EnvConfig } from '../../../../config/env.validation.js';

describe('WaybackurlsToolRunner', () => {
  it('declares its tool identity and supported target types', () => {
    const spawner = {
      spawn: jest.fn(),
    } as unknown as jest.Mocked<ToolProcessSpawner>;
    const configService = { get: jest.fn() } as unknown as jest.Mocked<
      ConfigService<EnvConfig, true>
    >;
    const runner = new WaybackurlsToolRunner(configService, spawner);
    expect(runner.tool).toBe('WAYBACKURLS');
    expect(runner.supportedTargetTypes).toEqual(['DOMAIN', 'SUBDOMAIN']);
  });

  it('passes the target value as the sole positional argv element', async () => {
    const spawner = {
      spawn: jest
        .fn<ToolProcessSpawner['spawn']>()
        .mockResolvedValue({ exitCode: 0, stdout: '', timedOut: false }),
    } as unknown as jest.Mocked<ToolProcessSpawner>;
    const configService = {
      get: jest.fn().mockReturnValue('waybackurls'),
    } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;
    const runner = new WaybackurlsToolRunner(configService, spawner);

    await runner.run({
      target: { id: 't1', type: 'DOMAIN', value: 'example.com' },
      job: { id: 'job-1', timeoutSeconds: 60 },
      signal: new AbortController().signal,
      onLog: jest.fn(),
    });

    expect(configService.get).toHaveBeenCalledWith(
      'RECON_TOOL_BIN_WAYBACKURLS',
      { infer: true },
    );
    const call = spawner.spawn.mock.calls[0][0];
    expect(call.args).toEqual(['example.com']);
    expect(call.command).toBe('waybackurls');
  });
});
