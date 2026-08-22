package pentesthub

import (
	"context"
	"fmt"
)

// SocResource mirrors SOC_ENDPOINTS (packages/shared/src/module17-endpoints.ts)
// / SocController (task #489/#491). A single composed read for the
// caller's own workspace — no workspaceId parameter.
type SocResource struct {
	http *HttpClient
}

// SocDashboardSummary mirrors SocDashboardSummaryDto.
type SocDashboardSummary struct {
	WorkspaceID                string        `json:"workspaceId"`
	OpenIncidentsCount         int           `json:"openIncidentsCount"`
	CriticalOpenIncidentsCount int           `json:"criticalOpenIncidentsCount"`
	RecentIncidents            []Incident    `json:"recentIncidents"`
	BreachedSlaEventsCount     int           `json:"breachedSlaEventsCount"`
	RecentBreachedSlaEvents    []SlaEvent    `json:"recentBreachedSlaEvents"`
	ActiveIndicatorsCount      int           `json:"activeIndicatorsCount"`
	Metrics                    interface{}   `json:"metrics"`
	ComputedAt                 string        `json:"computedAt"`
}

func (s *SocResource) Dashboard(ctx context.Context, windowDays int) (SocDashboardSummary, error) {
	var out SocDashboardSummary
	params := map[string]string{}
	if windowDays > 0 {
		params["windowDays"] = fmt.Sprintf("%d", windowDays)
	}
	err := s.http.Get(ctx, "/soc/dashboard", Query(params), &out)
	return out, err
}
