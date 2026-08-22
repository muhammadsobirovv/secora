package pentesthub

import (
	"context"
	"fmt"
)

// IncidentsResource mirrors INCIDENT_ENDPOINTS / IncidentsController
// (task #470, task #491). The five Link* mutations (assets/findings/
// indicators/evidence/research-sessions) are not yet wrapped here — same
// disclosed-scope, core-lifecycle-first posture as
// packages/cli/src/commands/incidents.ts.
type IncidentsResource struct {
	http *HttpClient
}

// IncidentSeverityFactors mirrors IncidentSeverityFactorsDto.
type IncidentSeverityFactors struct {
	Impact               *string  `json:"impact,omitempty"`
	Confidence           *float64 `json:"confidence,omitempty"`
	AssetCriticality     *string  `json:"assetCriticality,omitempty"`
	Exploitability       *string  `json:"exploitability,omitempty"`
	Exposure             *string  `json:"exposure,omitempty"`
	ThreatIntelRelevance *string  `json:"threatIntelRelevance,omitempty"`
}

// Incident mirrors IncidentDto.
type Incident struct {
	ID              string                   `json:"id"`
	WorkspaceID     string                   `json:"workspaceId"`
	ProjectID       string                   `json:"projectId"`
	Title           string                   `json:"title"`
	Description     string                   `json:"description"`
	Severity        string                   `json:"severity"`
	Status          string                   `json:"status"`
	SeverityFactors *IncidentSeverityFactors `json:"severityFactors"`
	ReporterID      string                   `json:"reporterId"`
	AssigneeID      *string                  `json:"assigneeId"`
	CreatedAt       string                   `json:"createdAt"`
	UpdatedAt       string                   `json:"updatedAt"`
	ResolvedAt      *string                  `json:"resolvedAt"`
	ClosedAt        *string                  `json:"closedAt"`
}

// IncidentTimelineEvent mirrors IncidentTimelineEventDto.
type IncidentTimelineEvent struct {
	ID          string                 `json:"id"`
	IncidentID  string                 `json:"incidentId"`
	EventType   string                 `json:"eventType"`
	ActorUserID *string                `json:"actorUserId"`
	Description string                 `json:"description"`
	Metadata    map[string]interface{} `json:"metadata"`
	CreatedAt   string                 `json:"createdAt"`
}

// CreateIncidentRequest mirrors CreateIncidentRequestDto.
type CreateIncidentRequest struct {
	ProjectID       string                   `json:"projectId"`
	Title           string                   `json:"title"`
	Description     string                   `json:"description"`
	Severity        string                   `json:"severity"`
	SeverityFactors *IncidentSeverityFactors `json:"severityFactors,omitempty"`
}

// ListIncidentsFilter holds optional query filters for List.
type ListIncidentsFilter struct {
	Status    string
	Severity  string
	ProjectID string
	Limit     int
}

func (i *IncidentsResource) List(ctx context.Context, filter ListIncidentsFilter) ([]Incident, error) {
	var out []Incident
	params := map[string]string{"status": filter.Status, "severity": filter.Severity, "projectId": filter.ProjectID}
	if filter.Limit > 0 {
		params["limit"] = fmt.Sprintf("%d", filter.Limit)
	}
	err := i.http.Get(ctx, "/incidents", Query(params), &out)
	return out, err
}

func (i *IncidentsResource) Create(ctx context.Context, req CreateIncidentRequest) (Incident, error) {
	var out Incident
	err := i.http.Post(ctx, "/incidents", req, &out)
	return out, err
}

func (i *IncidentsResource) Get(ctx context.Context, id string) (Incident, error) {
	var out Incident
	err := i.http.Get(ctx, fmt.Sprintf("/incidents/%s", id), nil, &out)
	return out, err
}

func (i *IncidentsResource) SetStatus(ctx context.Context, id, status, reason string) (Incident, error) {
	var out Incident
	body := map[string]string{"status": status}
	if reason != "" {
		body["reason"] = reason
	}
	err := i.http.Patch(ctx, fmt.Sprintf("/incidents/%s/status", id), body, &out)
	return out, err
}

func (i *IncidentsResource) Assign(ctx context.Context, id string, assigneeID *string) (Incident, error) {
	var out Incident
	err := i.http.Patch(ctx, fmt.Sprintf("/incidents/%s/assign", id), map[string]interface{}{"assigneeId": assigneeID}, &out)
	return out, err
}

func (i *IncidentsResource) Timeline(ctx context.Context, id string) ([]IncidentTimelineEvent, error) {
	var out []IncidentTimelineEvent
	err := i.http.Get(ctx, fmt.Sprintf("/incidents/%s/timeline", id), nil, &out)
	return out, err
}

func (i *IncidentsResource) AddNote(ctx context.Context, id, description string) (IncidentTimelineEvent, error) {
	var out IncidentTimelineEvent
	err := i.http.Post(ctx, fmt.Sprintf("/incidents/%s/timeline/notes", id), map[string]string{"description": description}, &out)
	return out, err
}
