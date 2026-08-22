package pentesthub

import (
	"context"
	"fmt"
)

// RiskResource mirrors RISK_ENDPOINTS / RiskController (task #474/#475,
// task #491).
type RiskResource struct {
	http *HttpClient
}

// RiskFactorSnapshot mirrors RiskFactorSnapshotDto.
type RiskFactorSnapshot struct {
	ID                 string                 `json:"id"`
	WorkspaceID        string                 `json:"workspaceId"`
	FindingID          *string                `json:"findingId"`
	AssetNodeType      *string                `json:"assetNodeType"`
	AssetRefID         *string                `json:"assetRefId"`
	RiskScore          float64                `json:"riskScore"`
	RiskTier           string                 `json:"riskTier"`
	RecommendedPriority string                `json:"recommendedPriority"`
	Factors            map[string]interface{} `json:"factors"`
	ComputedAt         string                 `json:"computedAt"`
}

// ComputeRiskScoreRequest mirrors ComputeRiskScoreRequestDto. Factors is
// a flat pass-through of RiskFactorsV2Dto fields (severity, cvssScore,
// epss, isKnownExploited, ...) — the server remains the single source of
// truth for the scoring formula.
type ComputeRiskScoreRequest struct {
	FindingID     *string
	AssetNodeType *string
	AssetRefID    *string
	Persist       bool
	Factors       map[string]interface{}
}

func (req ComputeRiskScoreRequest) toBody() map[string]interface{} {
	body := map[string]interface{}{}
	for k, v := range req.Factors {
		body[k] = v
	}
	if req.FindingID != nil {
		body["findingId"] = *req.FindingID
	}
	if req.AssetNodeType != nil {
		body["assetNodeType"] = *req.AssetNodeType
	}
	if req.AssetRefID != nil {
		body["assetRefId"] = *req.AssetRefID
	}
	if req.Persist {
		body["persist"] = true
	}
	return body
}

// Compute returns a map since the response shape differs depending on
// whether Persist was set (a persisted RiskFactorSnapshotDto vs. a
// non-persisting RiskScoreV2ResultDto preview) — callers that know which
// one they asked for can re-marshal into the appropriate struct.
func (r *RiskResource) Compute(ctx context.Context, req ComputeRiskScoreRequest) (map[string]interface{}, error) {
	var out map[string]interface{}
	err := r.http.Post(ctx, "/risk/compute", req.toBody(), &out)
	return out, err
}

func (r *RiskResource) LatestForFinding(ctx context.Context, findingID string) (*RiskFactorSnapshot, error) {
	var out *RiskFactorSnapshot
	err := r.http.Get(ctx, fmt.Sprintf("/risk/findings/%s", findingID), nil, &out)
	return out, err
}

func (r *RiskResource) HistoryForFinding(ctx context.Context, findingID string) ([]RiskFactorSnapshot, error) {
	var out []RiskFactorSnapshot
	err := r.http.Get(ctx, fmt.Sprintf("/risk/findings/%s/history", findingID), nil, &out)
	return out, err
}

func (r *RiskResource) LatestForAsset(ctx context.Context, nodeType, refID string) (*RiskFactorSnapshot, error) {
	var out *RiskFactorSnapshot
	err := r.http.Get(ctx, fmt.Sprintf("/risk/assets/%s/%s", nodeType, refID), nil, &out)
	return out, err
}

func (r *RiskResource) HistoryForAsset(ctx context.Context, nodeType, refID string) ([]RiskFactorSnapshot, error) {
	var out []RiskFactorSnapshot
	err := r.http.Get(ctx, fmt.Sprintf("/risk/assets/%s/%s/history", nodeType, refID), nil, &out)
	return out, err
}
