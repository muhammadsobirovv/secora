import { API_KEY_ENDPOINTS } from '@pentesthub/shared';
import type { ApiKeyDto, CreateApiKeyRequestDto, CreateApiKeyResultDto, RotateApiKeyResultDto } from '@pentesthub/shared';
import { loadConfig } from '../config.js';
import { buildHttpClient } from '../http.js';

function flagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : undefined;
}

/// Module 20 — CLI "api-keys" group. Mirrors `ApiKeysController`
/// (`/public-api/keys/*`), live since Module 15 (task #336) but never
/// wrapped by any CLI command until this parity pass — same
/// "core CRUD + lifecycle first" posture as `commands/incidents.ts`.

export async function apiKeysListCommand(args: string[]): Promise<void> {
  const workspaceId = flagValue(args, '--workspace-id');

  const http = buildHttpClient(loadConfig());
  const keys = await http.get<ApiKeyDto[]>(API_KEY_ENDPOINTS.list, { workspaceId });
  for (const k of keys) {
    console.log(`${k.id}\t${k.name}\t${k.prefix}\t${k.workspaceId ?? '(personal)'}\t${k.revokedAt ? 'REVOKED' : 'ACTIVE'}`);
  }
}

export async function apiKeysCreateCommand(args: string[]): Promise<void> {
  const name = flagValue(args, '--name');
  if (!name) {
    throw new Error(
      'Usage: pentesthub api-keys create --name <name> [--workspace-id <id>] [--scopes a,b] [--expires-in-days <n>] [--ip-allowlist a,b] [--rate-limit-per-minute <n>]',
    );
  }
  const workspaceId = flagValue(args, '--workspace-id');
  const scopesRaw = flagValue(args, '--scopes');
  const expiresInDaysRaw = flagValue(args, '--expires-in-days');
  const ipAllowlistRaw = flagValue(args, '--ip-allowlist');
  const rateLimitRaw = flagValue(args, '--rate-limit-per-minute');

  const body: CreateApiKeyRequestDto = {
    name,
    workspaceId,
    scopes: scopesRaw ? scopesRaw.split(',') : undefined,
    expiresInDays: expiresInDaysRaw ? Number(expiresInDaysRaw) : undefined,
    ipAllowlist: ipAllowlistRaw ? ipAllowlistRaw.split(',') : undefined,
    rateLimitPerMinute: rateLimitRaw ? Number(rateLimitRaw) : undefined,
  };

  const http = buildHttpClient(loadConfig());
  const result = await http.post<CreateApiKeyResultDto>(API_KEY_ENDPOINTS.create, body);
  console.log(JSON.stringify(result, null, 2));
}

export async function apiKeysRevokeCommand(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) throw new Error('Usage: pentesthub api-keys revoke <id>');

  const http = buildHttpClient(loadConfig());
  await http.delete<void>(API_KEY_ENDPOINTS.revoke(id));
  console.log(`Revoked ${id}`);
}

export async function apiKeysRotateCommand(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) throw new Error('Usage: pentesthub api-keys rotate <id>');

  const http = buildHttpClient(loadConfig());
  const result = await http.post<RotateApiKeyResultDto>(API_KEY_ENDPOINTS.rotate(id), undefined);
  console.log(JSON.stringify(result, null, 2));
}
