package pentesthub

import (
	"context"
	"fmt"
)

// ExtensionsResource mirrors EXTENSION_REGISTRY_ENDPOINTS
// (packages/shared/src/module16-endpoints.ts). Register/list/get/enable/
// disable/unregister for the caller's own workspace — matches
// ExtensionRegistryController.
type ExtensionsResource struct {
	http *HttpClient
}

// Extension mirrors ExtensionDto.
type Extension struct {
	ID           string                 `json:"id"`
	Name         string                 `json:"name"`
	Version      string                 `json:"version"`
	Type         string                 `json:"type"`
	Permissions  []string               `json:"permissions"`
	Capabilities []string               `json:"capabilities"`
	Entrypoint   string                 `json:"entrypoint"`
	Metadata     map[string]interface{} `json:"metadata,omitempty"`
	Enabled      bool                   `json:"enabled"`
	RegisteredBy string                 `json:"registeredBy"`
	RegisteredAt string                 `json:"registeredAt"`
	UpdatedAt    string                 `json:"updatedAt"`
}

// RegisterExtensionRequest mirrors RegisterExtensionRequestDto.
type RegisterExtensionRequest struct {
	Name         string                 `json:"name"`
	Version      string                 `json:"version"`
	Type         string                 `json:"type"`
	Permissions  []string               `json:"permissions"`
	Capabilities []string               `json:"capabilities"`
	Entrypoint   string                 `json:"entrypoint"`
	Metadata     map[string]interface{} `json:"metadata,omitempty"`
}

// ListExtensionsFilter holds optional query filters for List.
type ListExtensionsFilter struct {
	Type    string
	Enabled *bool
}

func (e *ExtensionsResource) List(ctx context.Context, filter ListExtensionsFilter) ([]Extension, error) {
	var out []Extension
	params := map[string]string{"type": filter.Type}
	if filter.Enabled != nil {
		if *filter.Enabled {
			params["enabled"] = "true"
		} else {
			params["enabled"] = "false"
		}
	}
	err := e.http.Get(ctx, "/extensions", Query(params), &out)
	return out, err
}

func (e *ExtensionsResource) Get(ctx context.Context, extensionID string) (Extension, error) {
	var out Extension
	err := e.http.Get(ctx, fmt.Sprintf("/extensions/%s", extensionID), nil, &out)
	return out, err
}

func (e *ExtensionsResource) Register(ctx context.Context, req RegisterExtensionRequest) (Extension, error) {
	var out Extension
	err := e.http.Post(ctx, "/extensions", req, &out)
	return out, err
}

func (e *ExtensionsResource) Enable(ctx context.Context, extensionID string) (Extension, error) {
	var out Extension
	err := e.http.Post(ctx, fmt.Sprintf("/extensions/%s/enable", extensionID), nil, &out)
	return out, err
}

func (e *ExtensionsResource) Disable(ctx context.Context, extensionID string) (Extension, error) {
	var out Extension
	err := e.http.Post(ctx, fmt.Sprintf("/extensions/%s/disable", extensionID), nil, &out)
	return out, err
}

func (e *ExtensionsResource) Unregister(ctx context.Context, extensionID string) error {
	return e.http.Delete(ctx, fmt.Sprintf("/extensions/%s", extensionID), nil)
}
