import { SCRIPT_ENGINE_ENDPOINTS } from '@pentesthub/shared';
import type { RunScriptRequestDto, ScriptDefinitionDto, ScriptExecutionDto } from '@pentesthub/shared';
import { loadConfig } from '../config.js';
import { buildHttpClient } from '../http.js';

export async function scriptsListCommand(): Promise<void> {
  const http = buildHttpClient(loadConfig());
  const scripts = await http.get<ScriptDefinitionDto[]>(SCRIPT_ENGINE_ENDPOINTS.list);
  for (const script of scripts) {
    console.log(`${script.id}\t${script.language}\t${script.name}`);
  }
}

export async function scriptsRunCommand(args: string[]): Promise<void> {
  const scriptId = args[0];
  if (!scriptId) throw new Error('Usage: pentesthub scripts run <scriptId> [--input \'{"key":"value"}\']');
  const inputFlagIndex = args.indexOf('--input');
  const inputJson = inputFlagIndex !== -1 ? args[inputFlagIndex + 1] : undefined;
  const input = inputJson ? (JSON.parse(inputJson) as Record<string, unknown>) : undefined;

  const http = buildHttpClient(loadConfig());
  const execution = await http.post<ScriptExecutionDto>(SCRIPT_ENGINE_ENDPOINTS.run(scriptId), {
    input,
  } satisfies RunScriptRequestDto);
  console.log(JSON.stringify(execution, null, 2));
  if (execution.status === 'FAILED' || execution.status === 'TIMEOUT') process.exitCode = 1;
}
