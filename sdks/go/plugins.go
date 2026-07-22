package pentesthub

import (
	"context"
	"fmt"
)

// PluginsResource covers /plugins (the global registry) and
// /enterprise/organizations/:id/plugin-installations — mirrors
// PLUGIN_REGISTRY_ENDPOINTS and PLUGIN_INSTALLATION_ENDPOINTS in
// packages/shared/src/plugins-endpoints.ts.
type PluginsResource struct {
	http *HttpClient
}

// Plugin mirrors PluginDto (packages/shared/src/plugins.ts).
type Plugin struct {
	ID            string  `json:"id"`
	OrganizationID *string `json:"organizationId"`
	Slug          string  `json:"slug"`
	Name          string  `json:"name"`
	Category      string  `json:"category"`
	Description   string  `json:"description"`
	AuthorUserID  string  `json:"authorUserId"`
	Status        string  `json:"status"`
	Verified      bool    `json:"verified"`
	DownloadCount int     `json:"downloadCount"`
	RatingAverage float64 `json:"ratingAverage"`
	RatingCount   int     `json:"ratingCount"`
	LatestVersion *string `json:"latestVersion"`
	CreatedAt     string  `json:"createdAt"`
	UpdatedAt     string  `json:"updatedAt"`
}

// PluginInstallation mirrors PluginInstallationDto (packages/shared/src/plugins.ts).
type PluginInstallation struct {
	ID             string  `json:"id"`
	OrganizationID *string `json:"organizationId"`
	WorkspaceID    *string `json:"workspaceId"`
	PluginID       string  `json:"pluginId"`
	VersionID      string  `json:"versionId"`
	InstalledBy    string  `json:"installedBy"`
	Enabled        bool    `json:"enabled"`
	InstalledAt    string  `json:"installedAt"`
	UpdatedAt      string  `json:"updatedAt"`
}

// InstallPluginRequest mirrors InstallPluginRequestDto.
type InstallPluginRequest struct {
	PluginID            string   `json:"pluginId"`
	VersionID            string   `json:"versionId"`
	WorkspaceID          string   `json:"workspaceId,omitempty"`
	AcceptedPermissions  []string `json:"acceptedPermissions"`
}

// ExecutePluginHookRequest mirrors ExecutePluginHookRequestDto.
type ExecutePluginHookRequest struct {
	Hook    string                 `json:"hook"`
	Payload map[string]interface{} `json:"payload,omitempty"`
}

// ExecutePluginHookResult mirrors ExecutePluginHookResultDto.
type ExecutePluginHookResult struct {
	Success bool                   `json:"success"`
	Output  map[string]interface{} `json:"output,omitempty"`
	Error   string                 `json:"error,omitempty"`
}

// ListPluginsFilter holds optional query filters for List.
type ListPluginsFilter struct {
	Category string
	Status   string
	Search   string
}

func (p *PluginsResource) List(ctx context.Context, filter ListPluginsFilter) ([]Plugin, error) {
	var out []Plugin
	query := Query(map[string]string{"category": filter.Category, "status": filter.Status, "search": filter.Search})
	err := p.http.Get(ctx, "/plugins", query, &out)
	return out, err
}

func (p *PluginsResource) Get(ctx context.Context, pluginID string) (Plugin, error) {
	var out Plugin
	err := p.http.Get(ctx, fmt.Sprintf("/plugins/%s", pluginID), nil, &out)
	return out, err
}

func (p *PluginsResource) ListInstallations(ctx context.Context, organizationID, workspaceID string) ([]PluginInstallation, error) {
	var out []PluginInstallation
	query := Query(map[string]string{"workspaceId": workspaceID})
	err := p.http.Get(ctx, fmt.Sprintf("/enterprise/organizations/%s/plugin-installations", organizationID), query, &out)
	return out, err
}

func (p *PluginsResource) Install(ctx context.Context, organizationID string, req InstallPluginRequest) (PluginInstallation, error) {
	var out PluginInstallation
	err := p.http.Post(ctx, fmt.Sprintf("/enterprise/organizations/%s/plugin-installations", organizationID), req, &out)
	return out, err
}

func (p *PluginsResource) Uninstall(ctx context.Context, organizationID, installationID string) error {
	return p.http.Delete(ctx, fmt.Sprintf("/enterprise/organizations/%s/plugin-installations/%s", organizationID, installationID), nil)
}

func (p *PluginsResource) ExecuteHook(ctx context.Context, organizationID, installationID string, req ExecutePluginHookRequest) (ExecutePluginHookResult, error) {
	var out ExecutePluginHookResult
	err := p.http.Post(ctx, fmt.Sprintf("/enterprise/organizations/%s/plugin-installations/%s/execute", organizationID, installationID), req, &out)
	return out, err
}
