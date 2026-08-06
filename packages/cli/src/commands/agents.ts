import { AGENT_SDK_ENDPOINTS } from '@pentesthub/shared';
import type { AgentSdkDefinitionDto, AgentSdkRunDto, StartAgentSdkRunRequestDto } from '@pentesthub/shared';
import { loadConfig } from '../config.js';
import { buildHttpClient } from '../http.js';

export async function agentsListCommand(): Promise<void> {
  const http = buildHttpClient(loadConfig());
  const definitions = await http.get<AgentSdkDefinitionDto[]>(AGENT_SDK_ENDPOINTS.list);
  for (const def of definitions) {
    console.log(`${def.id}\t${def.slug}\t${def.kind}\t${def.status}\t${def.name}`);
  }
}

export async function agentsRunCommand(args: string[]): Promise<void> {
  const agentSdkDefinitionId = args[0];
  if (!agentSdkDefinitionId) throw new Error('Usage: pentesthub agents run <definitionId> [--input \'{"key":"value"}\']');
  const inputFlagIndex = args.indexOf('--input');
  const inputJson = inputFlagIndex !== -1 ? args[inputFlagIndex + 1] : undefined;
  const input = inputJson ? (JSON.parse(inputJson) as Record<string, unknown>) : undefined;

  const http = buildHttpClient(loadConfig());
  const run = await http.post<AgentSdkRunDto>(AGENT_SDK_ENDPOINTS.startRun, {
    agentSdkDefinitionId,
    input,
  } satisfies StartAgentSdkRunRequestDto);
  console.log(JSON.stringify(run, null, 2));
  if (run.status === 'FAILED') process.exitCode = 1;
}

export async function agentsGetRunCommand(args: string[]): Promise<void> {
  const runId = args[0];
  if (!runId) throw new Error('Usage: pentesthub agents get-run <runId>');
  const http = buildHttpClient(loadConfig());
  const run = await http.get<AgentSdkRunDto>(AGENT_SDK_ENDPOINTS.getRun(runId));
  console.log(JSON.stringify(run, null, 2));
}
