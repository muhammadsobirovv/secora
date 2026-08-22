import { INCIDENT_ENDPOINTS } from '@pentesthub/shared';
import type {
  CreateIncidentRequestDto,
  IncidentDto,
  IncidentSeverity,
  IncidentStatus,
  IncidentTimelineEventDto,
} from '@pentesthub/shared';
import type { HttpClient } from '../http-client.js';

/// Module 17 — Incidents resource (task #491). Mirrors
/// `IncidentsController` (task #470). The five `link*` mutations
/// (assets/findings/indicators/evidence/research-sessions) are not yet
/// wrapped here — same disclosed-scope, core-lifecycle-first posture as
/// `packages/cli/src/commands/incidents.ts`.
export class IncidentsResource {
  constructor(private readonly http: HttpClient) {}

  list(params?: { status?: IncidentStatus; severity?: IncidentSeverity; projectId?: string; limit?: number }): Promise<IncidentDto[]> {
    return this.http.get<IncidentDto[]>(INCIDENT_ENDPOINTS.list(), params);
  }

  create(body: CreateIncidentRequestDto): Promise<IncidentDto> {
    return this.http.post<IncidentDto>(INCIDENT_ENDPOINTS.create(), body);
  }

  get(id: string): Promise<IncidentDto> {
    return this.http.get<IncidentDto>(INCIDENT_ENDPOINTS.incident(id));
  }

  setStatus(id: string, status: IncidentStatus, reason?: string): Promise<IncidentDto> {
    return this.http.patch<IncidentDto>(INCIDENT_ENDPOINTS.setStatus(id), { status, reason });
  }

  assign(id: string, assigneeId: string | null): Promise<IncidentDto> {
    return this.http.patch<IncidentDto>(INCIDENT_ENDPOINTS.assign(id), { assigneeId });
  }

  timeline(id: string): Promise<IncidentTimelineEventDto[]> {
    return this.http.get<IncidentTimelineEventDto[]>(INCIDENT_ENDPOINTS.timeline(id));
  }

  addNote(id: string, description: string): Promise<IncidentTimelineEventDto> {
    return this.http.post<IncidentTimelineEventDto>(INCIDENT_ENDPOINTS.addNote(id), { description });
  }
}
