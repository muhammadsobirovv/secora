package pentesthub

import (
	"context"
	"fmt"
)

// IntegrationsResource covers /integrations/capabilities and
// /enterprise/organizations/:id/integrations — mirrors
// INTEGRATION_ENDPOINTS in packages/shared/src/integrations-endpoints.ts.
// OAuth start/complete routes are browser-redirect flows, not a fit for
// a server-side SDK call, and are intentionally left unwrapped here —
// same scope decision as the TypeScript and Python SDKs.
type IntegrationsResource struct {
	http *HttpClient
}

// IntegrationCapability mirrors IntegrationCapabilityDto (packages/shared/src/integrations.ts).
type IntegrationCapability struct {
	Provider   string   `json:"provider"`
	Actions    []string `json:"actions"`
	AuthMethod string   `json:"authMethod"`
}

// IntegrationConnection mirrors IntegrationConnectionDto (packages/shared/src/integrations.ts).
type IntegrationConnection struct {
	ID            string  `json:"id"`
	OrganizationID *string `json:"organizationId"`
	WorkspaceID   *string `json:"workspaceId"`
	Provider      string  `json:"provider"`
	DisplayName   *string `json:"displayName"`
	Status        string  `json:"status"`
	ConnectedBy   string  `json:"connectedBy"`
	LastSyncedAt  *string `json:"lastSyncedAt"`
	CreatedAt     string  `json:"createdAt"`
	UpdatedAt     string  `json:"updatedAt"`
}

// ConnectIntegrationRequest mirrors ConnectIntegrationRequestDto.
type ConnectIntegrationRequest struct {
	Provider    string `json:"provider"`
	AuthMethod  string `json:"authMethod"`
	Token       string `json:"token,omitempty"`
	WorkspaceID string `json:"workspaceId,omitempty"`
}

// TestIntegrationConnectionResult mirrors TestIntegrationConnectionResultDto.
type TestIntegrationConnectionResult struct {
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
}

// ExecuteIntegrationActionRequest mirrors ExecuteIntegrationActionRequestDto.
type ExecuteIntegrationActionRequest struct {
	Action  string                 `json:"action"`
	Payload map[string]interface{} `json:"payload,omitempty"`
}

// ExecuteIntegrationActionResult mirrors ExecuteIntegrationActionResultDto.
type ExecuteIntegrationActionResult struct {
	Success bool                   `json:"success"`
	Result  map[string]interface{} `json:"result,omitempty"`
	Error   string                 `json:"error,omitempty"`
}

func (i *IntegrationsResource) Capabilities(ctx context.Context) ([]IntegrationCapability, error) {
	var out []IntegrationCapability
	err := i.http.Get(ctx, "/integrations/capabilities", nil, &out)
	return out, err
}

func (i *IntegrationsResource) List(ctx context.Context, organizationID string) ([]IntegrationConnection, error) {
	var out []IntegrationConnection
	err := i.http.Get(ctx, fmt.Sprintf("/enterprise/organizations/%s/integrations", organizationID), nil, &out)
	return out, err
}

func (i *IntegrationsResource) Connect(ctx context.Context, organizationID string, req ConnectIntegrationRequest) (IntegrationConnection, error) {
	var out IntegrationConnection
	err := i.http.Post(ctx, fmt.Sprintf("/enterprise/organizations/%s/integrations", organizationID), req, &out)
	return out, err
}

func (i *IntegrationsResource) Disconnect(ctx context.Context, organizationID, connectionID string) error {
	return i.http.Delete(ctx, fmt.Sprintf("/enterprise/organizations/%s/integrations/%s", organizationID, connectionID), nil)
}

func (i *IntegrationsResource) Test(ctx context.Context, organizationID, connectionID string) (TestIntegrationConnectionResult, error) {
	var out TestIntegrationConnectionResult
	err := i.http.Post(ctx, fmt.Sprintf("/enterprise/organizations/%s/integrations/%s/test", organizationID, connectionID), nil, &out)
	return out, err
}

func (i *IntegrationsResource) Execute(ctx context.Context, organizationID, connectionID string, req ExecuteIntegrationActionRequest) (ExecuteIntegrationActionResult, error) {
	var out ExecuteIntegrationActionResult
	err := i.http.Post(ctx, fmt.Sprintf("/enterprise/organizations/%s/integrations/%s/execute", organizationID, connectionID), req, &out)
	return out, err
}
