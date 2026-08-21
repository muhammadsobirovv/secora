import { SLA_ENDPOINTS } from '@pentesthub/shared';
import type { SlaEventDto, SlaPolicyDto, VulnFindingSeverity } from '@pentesthub/shared';
import { loadConfig } from '../config.js';
import { buildHttpClient } from '../http.js';

function flagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : undefined;
}

/// Module 17 — CLI task #490 "sla" group. Mirrors `SlaController`'s
/// `sla/*` routes (task #478).

export async function slaPoliciesCommand(): Promise<void> {
  const http = buildHttpClient(loadConfig());
  const policies = await http.get<SlaPolicyDto[]>(SLA_ENDPOINTS.policies());
  for (const p of policies) {
    console.log(`${p.id}\t${p.severity}\t${p.targetHours}h`);
  }
}

export async function slaUpsertPolicyCommand(args: string[]): Promise<void> {
  const severity = flagValue(args, '--severity') as VulnFindingSeverity | undefined;
  const targetHours = flagValue(args, '--target-hours');
  if (!severity || !targetHours) {
    throw new Error('Usage: pentesthub sla upsert-policy --severity <severity> --target-hours <n>');
  }

  const http = buildHttpClient(loadConfig());
  const policy = await http.post<SlaPolicyDto>(SLA_ENDPOINTS.upsertPolicy(), {
    severity,
    targetHours: Number(targetHours),
  });
  console.log(JSON.stringify(policy, null, 2));
}

export async function slaEventsCommand(args: string[]): Promise<void> {
  const incidentId = flagValue(args, '--incident-id');
  const findingId = flagValue(args, '--finding-id');
  const breachedOnly = args.includes('--breached-only');
  const limit = flagValue(args, '--limit');

  const http = buildHttpClient(loadConfig());
  const events = await http.get<SlaEventDto[]>(SLA_ENDPOINTS.events(), {
    incidentId,
    findingId,
    breachedOnly: breachedOnly ? true : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  for (const e of events) {
    console.log(`${e.id}\t${e.eventType}\t${e.dueAt}\t${e.breached}`);
  }
}
