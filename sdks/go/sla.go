package pentesthub

import (
	"context"
	"fmt"
)

// SlaResource mirrors SLA_ENDPOINTS / SlaController (task #478, task #491).
type SlaResource struct {
	http *HttpClient
}

// SlaPolicy mirrors SlaPolicyDto.
type SlaPolicy struct {
	ID             string `json:"id"`
	OrganizationID *string `json:"organizationId"`
	WorkspaceID    *string `json:"workspaceId"`
	Severity       string  `json:"severity"`
	TargetHours    int     `json:"targetHours"`
	CreatedAt      string  `json:"createdAt"`
}

// SlaEvent mirrors SlaEventDto.
type SlaEvent struct {
	ID         string  `json:"id"`
	WorkspaceID string `json:"workspaceId"`
	IncidentID *string `json:"incidentId"`
	FindingID  *string `json:"findingId"`
	PolicyID   string  `json:"policyId"`
	EventType  string  `json:"eventType"`
	DueAt      string  `json:"dueAt"`
	OccurredAt *string `json:"occurredAt"`
	Breached   bool    `json:"breached"`
	CreatedAt  string  `json:"createdAt"`
}

// ListSlaEventsFilter holds optional query filters for Events.
type ListSlaEventsFilter struct {
	IncidentID   string
	FindingID    string
	BreachedOnly bool
	Limit        int
}

func (s *SlaResource) Policies(ctx context.Context) ([]SlaPolicy, error) {
	var out []SlaPolicy
	err := s.http.Get(ctx, "/sla/policies", nil, &out)
	return out, err
}

func (s *SlaResource) UpsertPolicy(ctx context.Context, severity string, targetHours int) (SlaPolicy, error) {
	var out SlaPolicy
	err := s.http.Post(ctx, "/sla/policies", map[string]interface{}{"severity": severity, "targetHours": targetHours}, &out)
	return out, err
}

func (s *SlaResource) Events(ctx context.Context, filter ListSlaEventsFilter) ([]SlaEvent, error) {
	var out []SlaEvent
	params := map[string]string{"incidentId": filter.IncidentID, "findingId": filter.FindingID}
	if filter.BreachedOnly {
		params["breachedOnly"] = "true"
	}
	if filter.Limit > 0 {
		params["limit"] = fmt.Sprintf("%d", filter.Limit)
	}
	err := s.http.Get(ctx, "/sla/events", Query(params), &out)
	return out, err
}
