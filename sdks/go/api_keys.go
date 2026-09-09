package pentesthub

import (
	"context"
	"fmt"
)

// ApiKeysResource covers /public-api/keys — mirrors ApiKeysController,
// live on the server since Module 15 (task #336) but never wrapped in
// this SDK until this Module 20 parity pass.
type ApiKeysResource struct {
	http *HttpClient
}

// ApiKey mirrors ApiKeyDto.
type ApiKey struct {
	ID                 string   `json:"id"`
	Name               string   `json:"name"`
	WorkspaceID        *string  `json:"workspaceId"`
	Prefix             string   `json:"prefix"`
	Scopes             []string `json:"scopes"`
	LastUsedAt         *string  `json:"lastUsedAt"`
	ExpiresAt          *string  `json:"expiresAt"`
	RevokedAt          *string  `json:"revokedAt"`
	CreatedAt          string   `json:"createdAt"`
	IPAllowlist        []string `json:"ipAllowlist"`
	RateLimitPerMinute *int     `json:"rateLimitPerMinute"`
	RotatedFromID      *string  `json:"rotatedFromId"`
}

// CreateApiKeyRequest mirrors CreateApiKeyRequestDto.
type CreateApiKeyRequest struct {
	Name               string   `json:"name"`
	WorkspaceID        *string  `json:"workspaceId,omitempty"`
	Scopes             []string `json:"scopes,omitempty"`
	ExpiresInDays      *int     `json:"expiresInDays,omitempty"`
	IPAllowlist        []string `json:"ipAllowlist,omitempty"`
	RateLimitPerMinute *int     `json:"rateLimitPerMinute,omitempty"`
}

// CreateApiKeyResult mirrors CreateApiKeyResultDto. RawKey is returned
// exactly once, at creation — it is never retrievable again afterward.
type CreateApiKeyResult struct {
	ApiKey ApiKey `json:"apiKey"`
	RawKey string `json:"rawKey"`
}

// RotateApiKeyResult mirrors RotateApiKeyResultDto.
type RotateApiKeyResult struct {
	ApiKey ApiKey `json:"apiKey"`
	RawKey string `json:"rawKey"`
}

// List returns the caller's personal keys, or a workspace's keys if
// workspaceID is non-empty.
func (a *ApiKeysResource) List(ctx context.Context, workspaceID string) ([]ApiKey, error) {
	var out []ApiKey
	err := a.http.Get(ctx, "/public-api/keys", Query(map[string]string{"workspaceId": workspaceID}), &out)
	return out, err
}

func (a *ApiKeysResource) Create(ctx context.Context, req CreateApiKeyRequest) (CreateApiKeyResult, error) {
	var out CreateApiKeyResult
	err := a.http.Post(ctx, "/public-api/keys", req, &out)
	return out, err
}

// Revoke returns no body (204 No Content).
func (a *ApiKeysResource) Revoke(ctx context.Context, id string) error {
	return a.http.Delete(ctx, fmt.Sprintf("/public-api/keys/%s", id), nil)
}

func (a *ApiKeysResource) Rotate(ctx context.Context, id string) (RotateApiKeyResult, error) {
	var out RotateApiKeyResult
	err := a.http.Post(ctx, fmt.Sprintf("/public-api/keys/%s/rotate", id), nil, &out)
	return out, err
}
