import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/// Module 13 — CLI (task #292). Config lives at `~/.pentesthub/config.json`
/// — same directory-per-tool convention as `~/.aws`, `~/.docker`, etc.
/// Deliberately plain JSON on disk, not an OS keychain: matches this
/// repo's `sdks/python` and `sdks/go` clients, which also don't attempt
/// OS-keychain integration (a `PENTESTHUB_API_KEY` env var is the
/// recommended non-interactive/CI credential path — see README).
export interface CliConfig {
  baseUrl: string;
  accessToken?: string;
  refreshToken?: string;
  apiKey?: string;
}

const CONFIG_DIR = join(homedir(), '.pentesthub');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

const DEFAULT_BASE_URL = 'http://localhost:4000';

export function loadConfig(): CliConfig {
  if (process.env.PENTESTHUB_API_KEY) {
    return {
      baseUrl: process.env.PENTESTHUB_BASE_URL ?? DEFAULT_BASE_URL,
      apiKey: process.env.PENTESTHUB_API_KEY,
    };
  }
  if (!existsSync(CONFIG_PATH)) {
    return { baseUrl: process.env.PENTESTHUB_BASE_URL ?? DEFAULT_BASE_URL };
  }
  const raw = readFileSync(CONFIG_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as CliConfig;
  if (process.env.PENTESTHUB_BASE_URL) parsed.baseUrl = process.env.PENTESTHUB_BASE_URL;
  return parsed;
}

export function saveConfig(config: CliConfig): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function clearConfig(): void {
  saveConfig({ baseUrl: loadConfig().baseUrl });
}
