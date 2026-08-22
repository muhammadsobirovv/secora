package pentesthub

import (
	"context"
	"fmt"
)

// AssetsResource is Module 17's "assets" resource (task #491).
// Deliberately reuses Module 16's asset-graph/technology REST paths
// (ASSET_GRAPH_ENDPOINTS/TECHNOLOGY_ENDPOINTS in
// packages/shared/src/module16-endpoints.ts) rather than a parallel
// Module 17 endpoint catalog.
type AssetsResource struct {
	http *HttpClient
}

// AssetGraphNode mirrors AssetGraphNodeDto.
type AssetGraphNode struct {
	ID       string                 `json:"id"`
	NodeType string                 `json:"nodeType"`
	RefID    string                 `json:"refId"`
	Label    string                 `json:"label"`
	Metadata map[string]interface{} `json:"metadata,omitempty"`
}

// AssetGraphEdge mirrors AssetGraphEdgeDto.
type AssetGraphEdge struct {
	ID         string                 `json:"id"`
	FromNodeID string                 `json:"fromNodeId"`
	ToNodeID   string                 `json:"toNodeId"`
	EdgeType   string                 `json:"edgeType"`
	Metadata   map[string]interface{} `json:"metadata,omitempty"`
}

// AssetGraph mirrors AssetGraphDto.
type AssetGraph struct {
	TargetID    string           `json:"targetId"`
	Nodes       []AssetGraphNode `json:"nodes"`
	Edges       []AssetGraphEdge `json:"edges"`
	GeneratedAt string           `json:"generatedAt"`
}

// AttackSurfaceSummary mirrors AttackSurfaceSummaryDto.
type AttackSurfaceSummary struct {
	TotalAssets   int `json:"totalAssets"`
	LiveHosts     int `json:"liveHosts"`
	OpenPorts     int `json:"openPorts"`
	HTTPServices  int `json:"httpServices"`
	Endpoints     int `json:"endpoints"`
	Technologies  int `json:"technologies"`
}

// Technology mirrors TechnologyDto.
type Technology struct {
	ID          string  `json:"id"`
	TargetID    string  `json:"targetId"`
	Name        string  `json:"name"`
	Category    *string `json:"category"`
	Version     *string `json:"version"`
	DetectedVia string  `json:"detectedVia"`
	Confidence  float64 `json:"confidence"`
	FirstSeenAt string  `json:"firstSeenAt"`
	LastSeenAt  string  `json:"lastSeenAt"`
}

func (a *AssetsResource) Graph(ctx context.Context, targetID string) (AssetGraph, error) {
	var out AssetGraph
	err := a.http.Get(ctx, fmt.Sprintf("/assets/graph/%s", targetID), nil, &out)
	return out, err
}

func (a *AssetsResource) AttackSurface(ctx context.Context, projectID string) (AttackSurfaceSummary, error) {
	var out AttackSurfaceSummary
	err := a.http.Get(ctx, fmt.Sprintf("/assets/attack-surface/%s", projectID), nil, &out)
	return out, err
}

func (a *AssetsResource) Technologies(ctx context.Context, targetID string) ([]Technology, error) {
	var out []Technology
	err := a.http.Get(ctx, fmt.Sprintf("/assets/technologies/%s", targetID), nil, &out)
	return out, err
}
