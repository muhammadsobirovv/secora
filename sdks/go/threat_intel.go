package pentesthub

import (
	"context"
	"fmt"
)

// ThreatIntelResource mirrors THREAT_INTEL_ENDPOINTS / ThreatIntelController
// (/intel/*, tasks #465-469).
type ThreatIntelResource struct {
	http *HttpClient
}

// Indicator mirrors IndicatorDto.
type Indicator struct {
	ID          string   `json:"id"`
	WorkspaceID *string  `json:"workspaceId"`
	Type        string   `json:"type"`
	Value       string   `json:"value"`
	Status      string   `json:"status"`
	Confidence  float64  `json:"confidence"`
	Source      string   `json:"source"`
	Description *string  `json:"description"`
	FirstSeenAt string   `json:"firstSeenAt"`
	LastSeenAt  string   `json:"lastSeenAt"`
	ExpiresAt   *string  `json:"expiresAt"`
	Tags        []string `json:"tags"`
	UpdatedAt   string   `json:"updatedAt"`
}

// CreateIndicatorRequest mirrors CreateIndicatorRequestDto.
type CreateIndicatorRequest struct {
	Type        string   `json:"type"`
	Value       string   `json:"value"`
	Confidence  *float64 `json:"confidence,omitempty"`
	Description *string  `json:"description,omitempty"`
	Tags        []string `json:"tags,omitempty"`
	ExpiresAt   *string  `json:"expiresAt,omitempty"`
}

// ThreatActor mirrors ThreatActorDto.
type ThreatActor struct {
	ID          string   `json:"id"`
	WorkspaceID *string  `json:"workspaceId"`
	Name        string   `json:"name"`
	Aliases     []string `json:"aliases"`
	Description *string  `json:"description"`
	Source      string   `json:"source"`
	FirstSeenAt string   `json:"firstSeenAt"`
	LastSeenAt  string   `json:"lastSeenAt"`
	Tags        []string `json:"tags"`
}

// ThreatCampaign mirrors ThreatCampaignDto.
type ThreatCampaign struct {
	ID          string   `json:"id"`
	WorkspaceID *string  `json:"workspaceId"`
	Name        string   `json:"name"`
	Description *string  `json:"description"`
	Source      string   `json:"source"`
	FirstSeenAt string   `json:"firstSeenAt"`
	LastSeenAt  string   `json:"lastSeenAt"`
	Tags        []string `json:"tags"`
}

// ThreatReport mirrors ThreatReportDto.
type ThreatReport struct {
	ID          string   `json:"id"`
	WorkspaceID *string  `json:"workspaceId"`
	Title       string   `json:"title"`
	Summary     string   `json:"summary"`
	Source      string   `json:"source"`
	URL         *string  `json:"url"`
	PublishedAt *string  `json:"publishedAt"`
	Tags        []string `json:"tags"`
}

// ThreatTechnique mirrors ThreatTechniqueDto.
type ThreatTechnique struct {
	ID          string  `json:"id"`
	WorkspaceID *string `json:"workspaceId"`
	ExternalID  string  `json:"externalId"`
	Name        string  `json:"name"`
	Description *string `json:"description"`
	Tactic      *string `json:"tactic"`
	Source      string  `json:"source"`
}

// ThreatRelationship mirrors ThreatRelationshipDto.
type ThreatRelationship struct {
	ID           string  `json:"id"`
	WorkspaceID  *string `json:"workspaceId"`
	SourceType   string  `json:"sourceType"`
	SourceID     string  `json:"sourceId"`
	TargetType   string  `json:"targetType"`
	TargetID     string  `json:"targetId"`
	RelationType string  `json:"relationType"`
	Confidence   float64 `json:"confidence"`
	Source       string  `json:"source"`
	CreatedAt    string  `json:"createdAt"`
}

func (t *ThreatIntelResource) ListIndicators(ctx context.Context, indicatorType, status, search string, limit int) ([]Indicator, error) {
	var out []Indicator
	params := map[string]string{"type": indicatorType, "status": status, "search": search}
	if limit > 0 {
		params["limit"] = fmt.Sprintf("%d", limit)
	}
	err := t.http.Get(ctx, "/intel/indicators", Query(params), &out)
	return out, err
}

func (t *ThreatIntelResource) GetIndicator(ctx context.Context, id string) (Indicator, error) {
	var out Indicator
	err := t.http.Get(ctx, fmt.Sprintf("/intel/indicators/%s", id), nil, &out)
	return out, err
}

func (t *ThreatIntelResource) CreateIndicator(ctx context.Context, req CreateIndicatorRequest) (Indicator, error) {
	var out Indicator
	err := t.http.Post(ctx, "/intel/indicators", req, &out)
	return out, err
}

func (t *ThreatIntelResource) SetIndicatorStatus(ctx context.Context, id, status string) (Indicator, error) {
	var out Indicator
	err := t.http.Patch(ctx, fmt.Sprintf("/intel/indicators/%s/status", id), map[string]string{"status": status}, &out)
	return out, err
}

func (t *ThreatIntelResource) Actors(ctx context.Context) ([]ThreatActor, error) {
	var out []ThreatActor
	err := t.http.Get(ctx, "/intel/actors", nil, &out)
	return out, err
}

func (t *ThreatIntelResource) Campaigns(ctx context.Context) ([]ThreatCampaign, error) {
	var out []ThreatCampaign
	err := t.http.Get(ctx, "/intel/campaigns", nil, &out)
	return out, err
}

func (t *ThreatIntelResource) Reports(ctx context.Context) ([]ThreatReport, error) {
	var out []ThreatReport
	err := t.http.Get(ctx, "/intel/reports", nil, &out)
	return out, err
}

func (t *ThreatIntelResource) Techniques(ctx context.Context) ([]ThreatTechnique, error) {
	var out []ThreatTechnique
	err := t.http.Get(ctx, "/intel/techniques", nil, &out)
	return out, err
}

func (t *ThreatIntelResource) Relationships(ctx context.Context, objectType, objectID string) ([]ThreatRelationship, error) {
	var out []ThreatRelationship
	err := t.http.Get(ctx, fmt.Sprintf("/intel/relationships/%s/%s", objectType, objectID), nil, &out)
	return out, err
}

func (t *ThreatIntelResource) ImportLogs(ctx context.Context) ([]map[string]interface{}, error) {
	var out []map[string]interface{}
	err := t.http.Get(ctx, "/intel/import-logs", nil, &out)
	return out, err
}

func (t *ThreatIntelResource) Refresh(ctx context.Context, sourceType string) (map[string]interface{}, error) {
	var out map[string]interface{}
	body := map[string]string{}
	if sourceType != "" {
		body["sourceType"] = sourceType
	}
	err := t.http.Post(ctx, "/intel/refresh", body, &out)
	return out, err
}

func (t *ThreatIntelResource) ImportStix(ctx context.Context, bundle map[string]interface{}) (map[string]interface{}, error) {
	var out map[string]interface{}
	err := t.http.Post(ctx, "/intel/import/stix", map[string]interface{}{"bundle": bundle}, &out)
	return out, err
}

func (t *ThreatIntelResource) TaxiiPoll(ctx context.Context, collectionURL string) (map[string]interface{}, error) {
	var out map[string]interface{}
	err := t.http.Post(ctx, "/intel/taxii/poll", map[string]string{"collectionUrl": collectionURL}, &out)
	return out, err
}
