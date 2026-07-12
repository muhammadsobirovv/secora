import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { NmapToolRunner } from './nmap.tool-runner.js';
import type { ToolProcessSpawner } from '../process/spawn-tool-process.util.js';
import type { EnvConfig } from '../../../../config/env.validation.js';

function buildRunner(spawnResult: {
  exitCode: number | null;
  stdout: string;
  timedOut: boolean;
}) {
  const spawner = {
    spawn: jest
      .fn<ToolProcessSpawner['spawn']>()
      .mockResolvedValue(spawnResult),
  } as unknown as jest.Mocked<ToolProcessSpawner>;
  const configService = {
    get: jest.fn().mockReturnValue('nmap'),
  } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;
  const runner = new NmapToolRunner(configService, spawner);
  return { runner, spawner, configService };
}

describe('NmapToolRunner', () => {
  it('declares its tool identity and supported target types', () => {
    const { runner } = buildRunner({
      exitCode: 0,
      stdout: '',
      timedOut: false,
    });
    expect(runner.tool).toBe('NMAP');
    expect(runner.supportedTargetTypes).toEqual(
      expect.arrayContaining(['IP_ADDRESS', 'CIDR', 'DOMAIN', 'SUBDOMAIN']),
    );
  });

  // Security-critical: spawn must always receive an argv ARRAY, never a
  // shell-interpolated string — target.value is user-supplied and must
  // never reach a shell. This mechanically proves that invariant instead
  // of relying on code review.
  it('spawns with an argv array containing the target value as one element, never a shell string', async () => {
    const { runner, spawner, configService } = buildRunner({
      exitCode: 0,
      stdout: '<nmaprun></nmaprun>',
      timedOut: false,
    });
    const signal = new AbortController().signal;

    await runner.run({
      target: { id: 't1', type: 'DOMAIN', value: 'example.com; rm -rf /' },
      job: { id: 'job-1', timeoutSeconds: 60 },
      signal,
      onLog: jest.fn(),
    });

    expect(configService.get).toHaveBeenCalledWith('RECON_TOOL_BIN_NMAP', {
      infer: true,
    });
    expect(spawner.spawn).toHaveBeenCalledTimes(1);
    const call = spawner.spawn.mock.calls[0][0];
    expect(Array.isArray(call.args)).toBe(true);
    expect(call.args).toContain('example.com; rm -rf /');
    // The dangerous string is exactly one argv element — never merged
    // into a longer string that a shell could re-parse.
    expect(call.args.filter((a) => a.includes('rm -rf'))).toHaveLength(1);
    expect(call.