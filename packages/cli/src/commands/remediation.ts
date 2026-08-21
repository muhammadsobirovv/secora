import { REMEDIATION_ENDPOINTS } from '@pentesthub/shared';
import type {
  FindingVerificationDto,
  FindingVerificationStatus,
  RemediationEvidenceLinkDto,
  RemediationPriority,
  RemediationStatus,
  RemediationTaskDto,
} from '@pentesthub/shared';
import { loadConfig } from '../config.js';
import { buildHttpClient } from '../http.js';

function flagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : undefined;
}

/// Module 17 — CLI task #490 "remediation" group. Mirrors
/// `RemediationController`'s `remediation/tasks/*` routes plus the
/// sibling `FindingVerificationController`'s `findings/:id/verification`
/// route (see that controller's own doc comment for why the two live
/// together in one backend file).

export async function remediationListCommand(args: string[]): Promise<void> {
  const status = flagValue(args, '--status');
  const priority = flagValue(args, '--priority');
  const projectId = flagValue(args, '--project-id');
  const incidentId = flagValue(args, '--incident-id');
  const findingId = flagValue(args, '--finding-id');
  const limit = flagValue(args, '--limit');

  const http = buildHttpClient(loadConfig());
  const tasks = await http.get<RemediationTaskDto[]>(REMEDIATION_ENDPOINTS.list(), {
    status,
    priority,
    projectId,
    incidentId,
    findingId,
    limit: limit ? Number(limit) : undefined,
  });
  for (const t of tasks) {
    console.log(`${t.id}\t${t.priority}\t${t.status}\t${t.owner ?? ''}\t${t.dueDate ?? ''}`);
  }
}

export async function remediationCreateCommand(args: string[]): Promise<void> {
  const projectId = flagValue(args, '--project-id');
  if (!projectId) {
    throw new Error(
      'Usage: pentesthub remediation create --project-id <id> [--finding-id <id>] [--incident-id <id>] [--owner <name>] [--team <name>] [--priority LOW|MEDIUM|HIGH|CRITICAL] [--due-date <iso>] [--notes <text>]',
    );
  }

  const http = buildHttpClient(loadConfig());
  const task = await http.post<RemediationTaskDto>(REMEDIATION_ENDPOINTS.create(), {
    projectId,
    findingId: flagValue(args, '--finding-id'),
    incidentId: flagValue(args, '--incident-id'),
    owner: flagValue(args, '--owner'),
    team: flagValue(args, '--team'),
    priority: flagValue(args, '--priority') as RemediationPriority | undefined,
    dueDate: flagValue(args, '--due-date'),
    notes: flagValue(args, '--notes'),
  });
  console.log(JSON.stringify(task, null, 2));
}

export async function remediationGetCommand(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) throw new Error('Usage: pentesthub remediation get <id>');

  const http = buildHttpClient(loadConfig());
  const task = await http.get<RemediationTaskDto>(REMEDIATION_ENDPOINTS.task(id));
  console.log(JSON.stringify(task, null, 2));
}

export async function remediationSetStatusCommand(args: string[]): Promise<void> {
  const id = args[0];
  const status = args[1] as RemediationStatus | undefined;
  if (!id || !status) {
    throw new Error(
      'Usage: pentesthub remediation set-status <id> <OPEN|IN_PROGRESS|BLOCKED|READY_FOR_VERIFICATION|VERIFIED|CLOSED>',
    );
  }

  const http = buildHttpClient(loadConfig());
  const task = await http.patch<RemediationTaskDto>(REMEDIATION_ENDPOINTS.setStatus(id), { status });
  console.log(JSON.stringify(task, null, 2));
}

export async function remediationLinkEvidenceCommand(args: string[]): Promise<void> {
  const id = args[0];
  const evidenceId = flagValue(args, '--evidence-id');
  if (!id || !evidenceId) throw new Error('Usage: pentesthub remediation link-evidence <id> --evidence-id <id>');

  const http = buildHttpClient(loadConfig());
  const link = await http.post<RemediationEvidenceLinkDto>(REMEDIATION_ENDPOINTS.evidence(id), { evidenceId });
  console.log(JSON.stringify(link, null, 2));
}

export async function remediationFindingVerificationCommand(args: string[]): Promise<void> {
  const findingId = args[0];
  if (!findingId) throw new Error('Usage: pentesthub remediation finding-verification <findingId> [--status <status>] [--evidence-id <id>]');
  const status = flagValue(args, '--status') as FindingVerificationStatus | undefined;

  const http = buildHttpClient(loadConfig());
  if (status) {
    const evidenceId = flagValue(args, '--evidence-id');
    const result = await http.patch<FindingVerificationDto>(REMEDIATION_ENDPOINTS.findingVerification(findingId), {
      status,
      verificationEvidenceId: evidenceId,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const result = await http.get<FindingVerificationDto>(REMEDIATION_ENDPOINTS.findingVerification(findingId));
  console.log(JSON.stringify(result, null, 2));
}
