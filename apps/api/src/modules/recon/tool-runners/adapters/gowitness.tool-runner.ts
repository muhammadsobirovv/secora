import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EnvConfig } from '../../../../config/env.validation.js';
import { ToolProcessSpawner } from '../process/spawn-tool-process.util.js';
import type {
  ToolRunContext,
  ToolRunner,
  ToolRunResult,
} from '../tool-runner.interface.js';
import type { TargetType } from '../../../../prisma-types.js';

/// gowitness writes a screenshot file to disk rather than emitting
/// structured data on stdout, unlike every other adapter here — this
/// runner captures to a scratch directory, then reports the PNG's own
/// bytes (base64) as its "stdout" payload so GowitnessNormalizer can hand
/// them straight to the Evidence/Attachment upload path without a second
/// disk round-trip. --write-db=false / --write-jsonl=false keep this a
/// pure screenshot capture with no extra output files to clean up.
///
/// NOTE: gowitness isn't installed in this dev environment (see
/// docs/adr/0003-recon-engine-module.md) — these flags match gowitness
/// v3's documented `scan single` subcommand but haven't been exercised
/// against a real binary. Verify once installed; if flags differ, only
/// this file needs to change.
@Injectable()
export class GowitnessToolRunner implements ToolRunner {
  readonly tool = 'GOWITNESS' as const;
  readonly supportedTargetTypes: TargetType[] = ['URL', 'DOMAIN', 'SUBDOMAIN'];

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly spawner: ToolProcessSpawner,
  ) {}

  async run(ctx: ToolRunContext): Promise<ToolRunResult> {
    const bin = this.configService.get('RECON_TOOL_BIN_GOWITNESS', {
      infer: true,
    });
    const scratchDir = await mkdtemp(join(tmpdir(), 'recon-gowitness-'));

    try {
      const result = await this.spawner.spawn({
        command: bin,
        args: [
          'scan',
          'single',
          '--url',
          ctx.target.value,
          '--screenshot-path',
          scratchDir,
          '--write-db=false',
          '--write-jsonl=false',
        ],
        signal: ctx.signal,
        onStderrLine: (line) => ctx.onLog('WARN', line),
      });

      if (result.exitCode !== 0 || result.timedOut) {
        return { ...result, stdout: '' };
      }

      const files = await readdir(scratchDir);
      const screenshot = files.find((f) => f.endsWith('.png'));
      if (!screenshot) {
        ctx.onLog('WARN', 'gowitness produced no screenshot file');
        return { ...result, stdout: '' };
      }

      const bytes = await readFile(join(scratchDir, screenshot));
      return {
        ...result,
        stdout: JSON.stringify({
          url: ctx.target.value,
          fileName: screenshot,
          base64: bytes.toString('base64'),
        }),
      };
    } finally {
      await rm(scratchDir, { recursive: true, force: true });
    }
  }
}
