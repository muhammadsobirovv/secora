import { readFile, readdir } from 'node:fs/promises';

/// Resident memory of a tool and everything it started, read from /proc (Linux
/// only; elsewhere it answers null and no limit is applied). Used by the spawner
/// to stop a scan tool that grows without bound, so one scan cannot starve the
/// small server it runs on. The time limit per stage already exists; this is the
/// memory half of the same guard.

const PAGE_BYTES = 4096;

/// Parses `/proc/<pid>/stat`: "pid (comm) S ppid pgrp ...". `comm` may hold spaces
/// and parentheses, so everything is taken after the LAST ")".
export function parseStat(stat: string): { ppid: number; pgrp: number } | null {
  const end = stat.lastIndexOf(')');
  if (end < 0) return null;
  const fields = stat.slice(end + 2).split(' ');
  const ppid = Number(fields[1]);
  const pgrp = Number(fields[2]);
  return Number.isFinite(ppid) && Number.isFinite(pgrp) ? { ppid, pgrp } : null;
}

/// Parses `/proc/<pid>/statm` ("size resident shared ...", in pages) into bytes.
export function parseStatmResidentBytes(statm: string): number | null {
  const resident = Number(statm.split(' ')[1]);
  return Number.isFinite(resident) ? resident * PAGE_BYTES : null;
}

/// Sum of resident memory, in megabytes, over every process of the group `pgid`.
/// Returns null when /proc is not available.
export async function groupResidentMb(pgid: number, procRoot = '/proc'): Promise<number | null> {
  let entries: string[];
  try {
    entries = await readdir(procRoot);
  } catch {
    return null;
  }
  let bytes = 0;
  await Promise.all(
    entries
      .filter((name) => /^\d+$/.test(name))
      .map(async (name) => {
        try {
          const stat = parseStat(await readFile(`${procRoot}/${name}/stat`, 'utf8'));
          if (!stat || stat.pgrp !== pgid) return;
          const resident = parseStatmResidentBytes(await readFile(`${procRoot}/${name}/statm`, 'utf8')) ?? 0;
          // Added after the await: `bytes += await ...` would read a stale total.
          bytes += resident;
        } catch {
          // The process exited while it was being read.
        }
      }),
  );
  return bytes / (1024 * 1024);
}

/// The per-tool memory ceiling in megabytes: SCAN_TOOL_MAX_RSS_MB, 1536 by
/// default, 0 turns the guard off.
export function defaultMaxRssMb(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.SCAN_TOOL_MAX_RSS_MB;
  if (raw === undefined || raw === '') return 1536;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : 1536;
}
