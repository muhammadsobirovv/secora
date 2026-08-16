package pentesthub

import (
	"context"
	"fmt"
	"strings"
)

// KnowledgeGraphResource mirrors KNOWLEDGE_GRAPH_ENDPOINTS
// (packages/shared/src/module16-endpoints.ts). Every method operates on
// the caller's own workspace server-side — no workspaceId parameter,
// matching KnowledgeGraphController.
type KnowledgeGraphResource struct {
	http *HttpClient
}

// KnowledgeGraphNode mirrors KnowledgeGraphNodeDto.
type KnowledgeGraphNode struct {
	Type     string                 `json:"type"`
	ID       string                 `json:"id"`
	Label    string                 `json:"label"`
	Subtitle string                 `json:"subtitle,omitempty"`
	Metadata map[string]interface{} `json:"metadata,omitempty"`
}

// KnowledgeGraphRelationship mirrors KnowledgeGraphRelationshipDto.
type KnowledgeGraphRelationship struct {
	Relation string             `json:"relation"`
	Node     KnowledgeGraphNode `json:"node"`
}

// KnowledgeGraphSearchResult mirrors KnowledgeGraphSearchResultDto.
type KnowledgeGraphSearchResult struct {
	Type  string  `json:"type"`
	ID    string  `json:"id"`
	Label string  `json:"label"`
	Score float64 `json:"score"`
}

// KnowledgeGraphPathStep mirrors KnowledgeGraphPathStepDto.
type KnowledgeGraphPathStep struct {
	Node     KnowledgeGraphNode `json:"node"`
	Relation *string            `json:"relation"`
}

func (k *KnowledgeGraphResource) Search(ctx context.Context, query string, types []string, limit int) ([]KnowledgeGraphSearchResult, error) {
	var out []KnowledgeGraphSearchResult
	params := map[string]string{"query": query}
	if len(types) > 0 {
		params["types"] = strings.Join(types, ",")
	}
	if limit > 0 {
		params["limit"] = fmt.Sprintf("%d", limit)
	}
	err := k.http.Get(ctx, "/knowledge-graph/search", Query(params), &out)
	return out, err
}

func (k *KnowledgeGraphResource) FindPath(ctx context.Context, fromType, fromID, toType, toID string, maxDepth int) ([]KnowledgeGraphPathStep, error) {
	var out []KnowledgeGraphPathStep
	params := map[string]string{"fromType": fromType, "fromId": fromID, "toType": toType, "toId": toID}
	if maxDepth > 0 {
		params["maxDepth"] = fmt.Sprintf("%d", maxDepth)
	}
	err := k.http.Get(ctx, "/knowledge-graph/path", Query(params), &out)
	return out, err
}

func (k *KnowledgeGraphResource) GetNode(ctx context.Context, nodeType, id string) (KnowledgeGraphNode, error) {
	var out KnowledgeGraphNode
	err := k.http.Get(ctx, fmt.Sprintf("/knowledge-graph/nodes/%s/%s", nodeType, id), nil, &out)
	return out, err
}

func (k *KnowledgeGraphResource) GetRelationships(ctx context.Context, nodeType, id string) ([]KnowledgeGraphRelationship, error) {
	var out []KnowledgeGraphRelationship
	err := k.http.Get(ctx, fmt.Sprintf("/knowledge-graph/nodes/%s/%s/relationships", nodeType, id), nil, &out)
	return out, err
}
