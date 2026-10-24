import { describe, expect, it, jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation.js';
import type { ScannerProcessSpawner } from '../scanner-runners/process/spawn-scanner-process.util.js';
import { PipelineProbeStage } from './probe-stage.service.js';
import type { PinnedHost } from './pin.util.js';
import { HTTPX_RECORDED_PINNED } from './fixtures/recorded.js';

const pin: PinnedHost = { host: 'shop.lab.test', ip: '172.24.0.2', family: 4 };

/// Real output of httpx run pinned to the lab IP (see fixtures/recorded.ts): the
/// URL it reports is the IP it was given.
const pinnedRecorded = HTTPX_RECORDED_PINNED;

function build(stdout: string, timedOut = false) {
  const spawn = jest.fn(async () => ({ exitCode: 0, stdout, timedOut }));
  const spawner = { spawn } as unknown as ScannerProcessSpawner;
  const configService = { get: jest.fn(() => 'httpx') } as unknown as ConfigService<EnvConfig, true>;
  const logs: [string, string][] = [];
  const commands: { tool: string; argv: string[] }[] = [];
  const stage = new PipelineProbeStage(configService, spawner);
  const run = (signal = new AbortController().signal) =>
    stage.run({
      pin,
      signal,
      onLog: (level, message) => logs.push([level, message]),
      onCommand: (info) => commands.push({ tool: info.tool, argv: info.argv }),
    });
  return { run, spawn, logs, commands };
}

describe('PipelineProbeStage', () => {
  it('finds the live service from real httpx output and reports the real hostname, not the IP', async () => {
    const { run, logs } = build(pinnedRecorded);
    const result = await run();

    expect(result).toEqual({ outcome: 'OK', liveUrls: ['http://shop.lab.test'] });
    // Stage markers belong to the orchestrator, not to the probe.
    expect(logs.map(([, m]) => m).some((m) => m.startsWith('[stage]'))).toBe(false);
    expect(logs.some(([, m]) => m.includes('172.24.0.2') && m.startsWith('LIVE'))).toBe(false);
  });

  it('connects to the pinned IP with the real name as Host header, and audits the command', async () => {
    const { run, spawn, commands } = build(pinnedRecorded);
    await run();

    const call = (spawn.mock.calls[0] as unknown as [{ args: string[] }])[0];
    expect(call.args.filter((_, i) => call.args[i - 1] === '-u')).toEqual(['http://172.24.0.2', 'https://172.24.0.2']);
    expect(call.args).toContain('Host: shop.lab.test');
    expect(call.args).not.toContain('-fr');
    expect(commands).toEqual([{ tool: 'httpx', argv: call.args }]);
  });

  it('drops and logs a redirect that leaves the verified scope, and notes one that stays inside', async () => {
    const lines = [
      '{"url":"http://172.24.0.2","status_code":301,"location":"https://evil.example.net/phish"}',
      '{"url":"https://172.24.0.2","status_code":302,"location":"https://shop.lab.test/login"}',
    ].join('\n');
    const { run, logs } = build(lines);
    const result = await run();

    expect(result.liveUrls.sort()).toEqual(['http://shop.lab.test', 'https://shop.lab.test']);
    expect(logs).toContainEqual(['WARN', 'Redirect to https://evil.example.net/phish dropped: outside the verified scope.']);
    expect(logs).toContainEqual(['INFO', 'Redirect to https://shop.lab.test/login was not followed.']);
  });

  it('skips a result whose host is outside the verified scope', async () => {
    const { run, logs } = build('{"url":"https://other.example.net","status_code":200}');
    const result = await run();
    expect(result.liveUrls).toEqual([]);
    expect(logs.some(([level, m]) => level === 'WARN' && m.includes('outside the verified scope'))).toBe(true);
  });

  it('reports that nothing is live', async () => {
    const { run, logs } = build('');
    const result = await run();
    expect(result).toEqual({ outcome: 'OK', liveUrls: [] });
    expect(logs.map(([, m]) => m)).toContain('No live web service found on the host.');
  });

  it('reports a timeout and a cancellation differently', async () => {
    const timed = build('', true);
    expect((await timed.run()).outcome).toBe('TIMED_OUT');

    const cancelled = new AbortController();
    cancelled.abort();
    const aborted = build('', true);
    expect((await aborted.run(cancelled.signal)).outcome).toBe('ABORTED');
  });

  it('probes the port of a URL target, still through the pinned address', async () => {
    const spawn = jest.fn(async () => ({ exitCode: 0, stdout: '', timedOut: false }));
    const stage = new PipelineProbeStage(
      { get: jest.fn(() => 'httpx') } as unknown as ConfigService<EnvConfig, true>,
      { spawn } as unknown as ScannerProcessSpawner,
    );
    await stage.run({
      pin,
      url: 'http://shop.lab.test:8443/app',
      signal: new AbortController().signal,
      onLog: () => undefined,
    });
    const args = (spawn.mock.calls[0] as unknown as [{ args: string[] }])[0].args;
    expect(args.slice(0, 2)).toEqual(['-u', 'http://172.24.0.2:8443/app']);
    expect(args).toEqual(expect.arrayContaining(['-H', 'Host: shop.lab.test', '-sni', 'shop.lab.test']));
  });
});

describe('PipelineProbeStage — a probe that itself failed', () => {
  it('a tool that exits non-zero with no result is an error, not "nothing is live"', async () => {
    const spawn = jest.fn(async () => ({ exitCode: 2, stdout: '', timedOut: false }));
    const stage = new PipelineProbeStage(
      { get: jest.fn(() => 'httpx') } as unknown as ConfigService<EnvConfig, true>,
      { spawn } as unknown as ScannerProcessSpawner,
    );
    await expect(
      stage.run({ pin, signal: new AbortController().signal, onLog: () => undefined }),
    ).rejects.toThrow(/httpx exited with code 2/);
  });

  it('a probe that runs fine and finds nothing is still just "nothing live"', async () => {
    const spawn = jest.fn(async () => ({ exitCode: 0, stdout: '', timedOut: false }));
    const stage = new PipelineProbeStage(
      { get: jest.fn(() => 'httpx') } as unknown as ConfigService<EnvConfig, true>,
      { spawn } as unknown as ScannerProcessSpawner,
    );
    await expect(stage.run({ pin, signal: new AbortController().signal, onLog: () => undefined })).resolves.toEqual({
      outcome: 'OK',
      liveUrls: [],
    });
  });
});
