import { INCIDENT_ENDPOINTS } from '@pentesthub/shared';
import type { IncidentDto, IncidentSeverity, IncidentStatus, IncidentTimelineEventDto } from '@pentesthub/shared';
import { loadConfig } from '../config.js';
import { buildHttpClient } from '../http.js';

function flagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : undefined;
}

/// Module 17 — CLI task #490 "incidents" group. Mirrors
/// `IncidentsController` (`/incidents/*`) — link-* subcommands (assets/
/// findings/indicators/evidence/research-sessions) are intentionally out
/// of scope for this pass (same "core CRUD + lifecycle first" posture the
/// task's own list ordering implies); use the REST API or web UI for
/// those until a follow-up CLI task adds them.

export async function incidentsListCommand(args: string[]): Promise<void> {
  const status = flagValue(args, '--status');
  const severity = flagValue(args, '--severity');
  const projectId = flagValue(args, '--project-id');
  const limit = flagValue(args, '--limit');

  const http = buildHttpClient(loadConfig());
  const incidents = await http.get<IncidentDto[]>(INCIDENT_ENDPOINTS.list(), {
    status,
    severity,
    projectId,
    limit: limit ? Number(limit) : undefined,
  });
  for (const i of incidents) {
    console.log(`${i.id}\t${i.severity}\t${i.status}\t${i.title}`);
  }
}

export async function incidentsCreateCommand(args: string[]): Promise<void> {
  const projectId = flagValue(args, '--project-id');
  const title = flagValue(args, '--title');
  const description = flagValue(args, '--description');
  const severity = flagValue(args, '--severity') as IncidentSeverity | undefined;
  if (!projectId || !title || !description || !severity) {
    throw new Error(
      'Usage: pentesthub incidents create --project-id <id> --title <title> --description <text> --severity <LOW|MEDIUM|HIGH|CRITICAL>',
    );
  }

  const http = buildHttpClient(loadConfig());
  const incident = await http.post<IncidentDto>(INCIDENT_ENDPOINTS.create(), {
    projectId,
    title,
    description,
    severity,
  });
  console.log(JSON.stringify(incident, null, 2));
}

export async function incidentsGetCommand(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) throw new Error('Usage: pentesthub incidents get <id>');

  const http = buildHttpClient(loadConfig());
  const incident = await http.get<IncidentDto>(INCIDENT_ENDPOINTS.incident(id));
  console.log(JSON.stringify(incident, null, 2));
}

export async function incidentsSetStatusCommand(args: string[]): Promise<void> {
  const id = args[0];
  const status = args[1] as IncidentStatus | undefined;
  if (!id || !status) {
    throw new Error('Usage: pentesthub incidents set-status <id> <status> [--reason <text>]');
  }
  const reason = flagValue(args, '--reason');

  const http = buildHttpClient(loadConfig());
  const incident = await http.patch<IncidentDto>(INCIDENT_ENDPOINTS.setStatus(id), { status, reason });
  console.log(JSON.stringify(incident, null, 2));
}

export async function incidentsAssignCommand(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) throw new Error('Usage: pentesthub incidents assign <id> [--assignee-id <userId>]');
  const assigneeId = flagValue(args, '--assignee-id');

  const http = buildHttpClient(loadConfig());
  const incident = await http.patch<IncidentDto>(INCIDENT_ENDPOINTS.assign(id), { assigneeId: assigneeId ?? null });
  console.log(JSON.stringify(incident, null, 2));
}

export async function incidentsTimelineCommand(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) throw new Error('Usage: pentesthub incidents timeline <id>');

  const http = buildHttpClient(loadConfig());
  const events = await http.get<IncidentTimelineEventDto[]>(INCIDENT_ENDPOINTS.timeline(id));
  for (const e of events) {
    console.log(`${e.createdAt}\t${e.eventType}\t${e.description}`);
  }
}

export async function incidentsAddNoteCommand(args: string[]): Promise<void> {
  const id = args[0];
  const description = flagValue(args, '--description');
  if (!id || !description) throw new Error('Usage: pentesthub incidents add-note <id> --description <text>');

  const http = buildHttpClient(loadConfig());
  const event = await http.post<IncidentTimelineEventDto>(INCIDENT_ENDPOINTS.addNote(id), { description });
  console.log(JSON.stringify(event, null, 2));
}
