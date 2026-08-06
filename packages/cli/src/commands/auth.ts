import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { AUTH_ENDPOINTS } from '@pentesthub/shared';
import type { AuthenticatedUserDto, AuthTokensDto, LoginRequestDto, MfaRequiredResponseDto } from '@pentesthub/shared';
import { clearConfig, loadConfig, saveConfig } from '../config.js';
import { buildHttpClient } from '../http.js';

/// Plain (visible) terminal prompt — no external dependency for masked
/// password input. `pentesthub login --api-key <key>` (or the
/// `PENTESTHUB_API_KEY` env var, see `config.ts`) is the recommended
/// path for anyone who'd rather not type a password where it can echo;
/// this disclosed limitation is documented in the CLI's README.
async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer;
}

export async function loginCommand(args: string[]): Promise<void> {
  const apiKeyFlagIndex = args.indexOf('--api-key');
  const config = loadConfig();

  if (apiKeyFlagIndex !== -1) {
    const apiKey = args[apiKeyFlagIndex + 1];
    if (!apiKey) throw new Error('Usage: pentesthub login --api-key <key>');
    saveConfig({ baseUrl: config.baseUrl, apiKey });
    console.log(`Saved API key for ${config.baseUrl}.`);
    return;
  }

  const email = await prompt('Email: ');
  const password = await prompt('Password (visible — see README for --api-key): ');
  const http = buildHttpClient(config);
  const result = await http.post<AuthTokensDto | MfaRequiredResponseDto>(AUTH_ENDPOINTS.login, {
    email,
    password,
  } satisfies LoginRequestDto);

  if (!('accessToken' in result)) {
    throw new Error(
      'This account has MFA enabled — the CLI does not yet support MFA challenges. Use `pentesthub login --api-key <key>` instead.',
    );
  }
  saveConfig({ baseUrl: config.baseUrl, accessToken: result.accessToken, refreshToken: result.refreshToken });
  console.log(`Logged in to ${config.baseUrl} as ${email}.`);
}

export async function logoutCommand(): Promise<void> {
  clearConfig();
  console.log('Logged out — local credentials cleared.');
}

export async function whoamiCommand(): Promise<void> {
  const config = loadConfig();
  const http = buildHttpClient(config);
  const user = await http.get<AuthenticatedUserDto>(AUTH_ENDPOINTS.me);
  console.log(JSON.stringify(user, null, 2));
}
