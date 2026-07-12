import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'node:fs';
import { GowitnessToolRunner } from './gowitness.tool-runner.js';
import type { ToolProcessSpawner } from '../process/spawn-tool-process.util.js';
import type { EnvConfig } from '../../../../config/env.validation.js';

describe('GowitnessToolRunner', () => {
  it('declares its tool identity and supported target types', () => {
    const spawner = {
      spawn: jest.fn(),
    } as unknown as jest.Mocked<ToolProcessSpawner>;
    const configService = { get: jest.fn() } as unknown as jest.Mocked<
      ConfigService<EnvConfig, true>
    >;
    const runner = new GowitnessToolRunner(configService, spawner);
    expect(runner.tool).toBe('GOWITNESS');
    expect(runner.supportedTargetTypes).toEqual(['URL', 'DOMAIN', 'SUBDOMAIN']);
  });

  it('spawns with an argv array containing the target value as one element, and cleans up its scratch dir', async () => {
    let capturedScratchDir: string | undefined;
    const spawner = {
      spawn: jest
        .fn<ToolProcessSpawner['spawn']>()
        .mockImplementation((options) => {
          const dirIndex = options.args.indexOf('--screenshot-path');
          capturedScratchDir = options.args[dirIndex + 1];
          // No real gowitness runs — scratch dir stays empty, exercising
          // the "no screenshot produced" branch.
          return Promise.resolve({ exitCode: 0, stdout: '', timedOut: false });
        }),
    } as unknown as jest.Mocked<ToolProcessSpawner>;
    const configService = {
      get: jest.fn().mockReturnValue('gowitness'),
    } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;
    const runner = new GowitnessToolRunner(configService, spawner);
    const onLog = jest.fn();

    const result = await runner.run({
      target: { id: 't1', type: 'URL', value: 'http://example.com/$(whoami)' },
      job: { id: 'job-1', timeoutSeconds: 60 },
      signal: new AbortController().signal,
      onLog,
    });

    expect(configService.get).toHaveBeenCalledWith('RECON_TOOL_BIN_GOWITNESS', {
      infer: true,
    });
    const call = spawner.spawn.mock.calls[0][0];
    expect(Array.isArray(call.args)).toBe(true);
    expect(call.args.filter((a) => a.includes('$(whoami)'))).toHaveLength(1);
    expect(call.command).toBe('gowitness');

    // No screenshot file was produced (no real binary ran) — graceful
    // empty result, not a thrown error, and a warning log.
    expect(result.stdout).toBe('');
    expect(onLog).toHaveBeenCalledWith(
      'WARN',
      expect.stringContaining('no screenshot'),
    );

    // The scratch directory is removed afterward regardless of outcome.
    expect(capturedScratchDir).toBeDefined()