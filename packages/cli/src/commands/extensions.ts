import { EXTENSION_REGISTRY_ENDPOINTS } from '@pentesthub/shared';
import type { ExtensionDto, ExtensionInvocationResultDto, InvokeExtensionRequestDto, RegisterExtensionRequestDto } from '@pentesthub/shared';
import { loadConfig } from '../config.js';
import { buildHttpClient } from '../http.js';

function flagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : undefined;
}

export async function extensionsListCommand(args: string[]): Promise<void> {
  const type = flagValue(args, '--type');
  const enabledFlag = flagValue(args, '--enabled');

  const http = buildHttpClient(loadConfig());
  const extensions = await http.get<ExtensionDto[]>(EXTENSION_REGISTRY_ENDPOINTS.list(), {
    type,
    enabled: enabledFlag !== undefined ? enabledFlag === 'true' : undefined,
  });
  for (const ext of extensions) {
    console.log(`${ext.id}\t${ext.type}\t${ext.name}@${ext.version}\t${ext.enabled ? 'enabled' : 'disabled'}`);
  }
}

export async function extensionsGetCommand(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) throw new Error('Usage: pentesthub extensions get <id>');
  const http = buildHttpClient(loadConfig());
  const extension = await http.get<ExtensionDto>(EXTENSION_REGISTRY_ENDPOINTS.extension(id));
  console.log(JSON.stringify(extension, null, 2));
}

export async function extensionsRegisterCommand(args: string[]): Promise<void> {
  const manifestPath = flagValue(args, '--manifest');
  if (!manifestPath) throw new Error('Usage: pentesthub extensions register --manifest <path-to-manifest.json>');

  const fs = await import('node:fs/promises');
  const raw = await fs.readFile(manifestPath, 'utf-8');
  const manifest = JSON.parse(raw) as RegisterExtensionRequestDto;

  const http = buildHttpClient(loadConfig());
  const extension = await http.post<ExtensionDto>(EXTENSION_REGISTRY_ENDPOINTS.register(), manifest);
  console.log(JSON.stringify(extension, null, 2));
}

export async function extensionsEnableCommand(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) throw new Error('Usage: pentesthub extensions enable <id>');
  const http = buildHttpClient(loadConfig());
  const extension = await http.post<ExtensionDto>(EXTENSION_REGISTRY_ENDPOINTS.enable(id));
  console.log(JSON.stringify(extension, null, 2));
}

export async function extensionsDisableCommand(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) throw new Error('Usage: pentesthub extensions disable <id>');
  const http = buildHttpClient(loadConfig());
  const extension = await http.post<ExtensionDto>(EXTENSION_REGISTRY_ENDPOINTS.disable(id));
  console.log(JSON.stringify(extension, null, 2));
}

export async function extensionsUnregisterCommand(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) throw new Error('Usage: pentesthub extensions unregister <id>');
  const http = buildHttpClient(loadConfig());
  await http.delete<void>(EXTENSION_REGISTRY_ENDPOINTS.unregister(id));
  console.log(`Unregistered extension ${id}.`);
}

/// Hardening pass (task #454): the real invocation path — the server
/// runs ExtensionPermissionEnforcer.assertAuthorized() before ever
/// contacting the extension's entrypoint.
export async function extensionsInvokeCommand(args: string[]): Promise<void> {
  const id = args[0];
  const permission = flagValue(args, '--permission');
  if (!id || !permission) {
    throw new Error('Usage: pentesthub extensions invoke <id> --permission <PERMISSION> [--input \'{"k":"v"}\']');
  }
  const inputRaw = flagValue(args, '--input');
  const body: InvokeExtensionRequestDto = {
    permission: permission as InvokeExtensionRequestDto['permission'],
    input: inputRaw ? (JSON.parse(inputRaw) as Record<string, unknown>) : undefined,
  };

  const http = buildHttpClient(loadConfig());
  const result = await http.post<ExtensionInvocationResultDto>(EXTENSION_REGISTRY_ENDPOINTS.invoke(id), body);
  console.log(JSON.stringify(result, null, 2));
}
