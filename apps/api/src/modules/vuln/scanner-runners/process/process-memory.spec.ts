import { describe, expect, it } from '@jest/globals';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultMaxRssMb, groupResidentMb, parseStat, parseStatmResidentBytes } from './process-memory.js';
import { ScannerProcessSpawner } from './spawn-scanner-process.util.js';

describe('parsing /proc', () => {
  it('reads ppid and process group even when the command name has spaces and brackets', () => {
    expect(parseStat('42 (nuclei) S 1 42 42 0 -1 4194304')).toEqual({ ppid: 1, pgrp: 42 });
    expect(parseStat('43 (a b) c) R 42 42 42 0 -1')).toEqual({ ppid: 42, pgrp: 42 });
    expect(parseStat('garbage')).toBeNull();
  });

  it('turns statm pages into bytes', () => {
    expect(parseStatmResidentBytes('1000 256 10 0 0 0 0')).toBe(256 * 4096);
    expect(parseStatmResidentBytes('x')).toBeNull();
  });

  it('adds up the processes of one group and ignores the others', async () => {
    const root = mkdtempSync(join(tmpdir(), 'proc-'));
    try {
      const add = (pid: number, pgrp: number, residentPages: number) => {
        mkdirSync(join(root, String(pid)));
        writeFileSync(join(root, String(pid), 'stat'), `${pid} (tool) S 1 ${pgrp} ${pgrp} 0`);
        writeFileSync(join(root, String(pid), 'statm'), `9999 ${residentPages} 0 0 0 0 0`);
      };
      add(100, 100, 25600); // 100 MB
      add(101, 100, 12800); // 50 MB, same group (a child)
      add(200, 200, 256000); // another group: not counted
      mkdirSync(join(root, 'self'));
      expect(await groupResidentMb(100, root)).toBeCloseTo(150, 0);
      expect(await groupResidentMb(300, root)).toBe(0);
      expect(await groupResidentMb(100, join(root, 'missing'))).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('the memory ceiling', () => {
  it('defaults to 1536 MB, can be changed, and 0 turns it off', () => {
    expect(defaultMaxRssMb({})).toBe(1536);
    expect(defaultMaxRssMb({ SCAN_TOOL_MAX_RSS_MB: '512' })).toBe(512);
    expect(defaultMaxRssMb({ SCAN_TOOL_MAX_RSS_MB: '0' })).toBe(0);
    expect(defaultMaxRssMb({ SCAN_TOOL_MAX_RSS_MB: 'lots' })).toBe(1536);
  });
});

describe('ScannerProcessSpawner memory guard (Linux only)', () => {
  (process.platform === 'linux' ? it : it.skip)('stops a tool that grows past the limit and keeps what it printed', async () => {
    const spawner = new ScannerProcessSpawner();
    const hog = 'console.log("started"); const keep=[]; setInterval(()=>keep.push(Buffer.alloc(40*1024*1024,1)),200); setTimeout(()=>{},60000)';
    const result = await spawner.spawn({
      command: process.execPath,
      args: ['-e', hog],
      signal: AbortSignal.timeout(30_000),
      niceLevel: 0,
      maxRssMb: 150,
      killGraceMs: 500,
    });
    expect(result.memoryExceeded).toBe(true);
    expect(result.timedOut).toBe(true);
    expect(result.stdout).toContain('started');
  }, 40_000);
});
