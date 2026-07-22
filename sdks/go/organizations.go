package pentesthub

import (
	"context"
	"fmt"
)

// OrganizationsResource covers /enterprise/organizations — mirrors
// ORGANIZATION_ENDPOINTS in packages/shared/src/enterprise-endpoints.ts.
type OrganizationsResource struct {
	http *HttpClient
}

// Organization mirrors OrganizationDto.
type Organization struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Slug   string `json:"slug"`
	Status string `json:"status"`
}

// CreateOrganizationRequest mirrors CreateOrganizationRequestDto.
type CreateOrganizationRequest struct {
	Name string `json:"name"`
	Slug string `json:"slug"`
}

// UpdateOrganizationRequest mirrors UpdateOrganizationRequestDto. Pointer
// fields distinguish "omit" from "set to empty string" under Go's JSON
// encoding (a nil pointer is omitted; a pointer to "" is sent).
type UpdateOrganizationRequest struct {
	Name *string `json:"name,omitempty"`
	Slug *string `json:"slug,omitempty"`
}

func (o *OrganizationsResource) List(ctx context.Context) ([]Organization, error) {
	var out []Organization
	err := o.http.Get(ctx, "/enterprise/organizations", nil, &out)
	return out, err
}

func (o *OrganizationsResource) Get(ctx context.Context, organizationID string) (Organization, error) {
	var out Organization
	err := o.http.Get(ctx, fmt.Sprintf("/enterprise/organizations/%s", organizationID), nil, &out)
	return out, err
}

func (o *OrganizationsResource) Create(ctx context.Context, req CreateOrganizationRequest) (Organization, error) {
	var out Organization
	err := o.http.Post(ctx, "/enterprise/organizations", req, &out)
	return out, err
}

func (o *OrganizationsResource) Update(ctx context.Context, organizationID string, req UpdateOrganizationRequest) (Organization, error) {
	var out Organization
	err := o.http.Patch(ctx, fmt.Sprintf("/enterprise/organizations/%s", organizationID), req, &out)
	return out, err
}
