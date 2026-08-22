package pentesthub

import (
	"context"
	"fmt"
)

// RemediationResource mirrors REMEDIATION_ENDPOINTS /
// RemediationController / FindingVerificationController (task #477,
// task #491).
type RemediationResource struct {
	http *HttpClient
}

// RemediationTask mirrors RemediationTaskDto.
type RemediationTask struct {
	ID           string  `json:"id"`
	WorkspaceID  string  `json:"workspaceId"`
	ProjectID    string  `json:"projectId"`
	FindingID    *string `json:"findingId"`
	IncidentID   *string `json:"incidentId"`
	AssetNodeType *string `json:"assetNodeType"`
	AssetRefID   *string `json:"assetRefId"`
	Owner        *string `json:"owner"`
	Team         *string `json:"team"`
	Priority     string  `json:"priority"`
	DueDate      *string `json:"dueDate"`
	Status       string  `json:"status"`
	Notes        *string `json:"notes"`
	CreatedAt    string  `json:"createdAt"`
	UpdatedAt    string  `json:"updatedAt"`
	ClosedAt     *string `json:"closedAt"`
}

// RemediationEvidenceLink mirrors RemediationEvidenceLinkDto.
type RemediationEvidenceLink struct {
	ID                string  `json:"id"`
	RemediationTaskID string  `json:"remediationTaskId"`
	EvidenceID        string  `json:"evidenceId"`
	LinkedBy          *string `json:"linkedBy"`
	LinkedAt          string  `json:"linkedAt"`
}

// FindingVerification mirrors FindingVerificationDto.
type FindingVerification struct {
	FindingID                string  `json:"findingId"`
	Status                    string  `json:"status"`
	VerificationEvidenceID    *string `json:"verificationEvidenceId"`
	VerifiedBy                *string `json:"verifiedBy"`
	VerifiedAt                *string `json:"verifiedAt"`
}

// CreateRemediationTaskRequest mirrors CreateRemediationTaskRequestDto.
type CreateRemediationTaskRequest struct {
	ProjectID     string  `json:"projectId"`
	FindingID     *string `json:"findingId,omitempty"`
	IncidentID    *string `json:"incidentId,omitempty"`
	AssetNodeType *string `json:"assetNodeType,omitempty"`
	AssetRefID    *string `json:"assetRefId,omitempty"`
	Owner         *string `json:"owner,omitempty"`
	Team          *string `json:"team,omitempty"`
	Priority      *string `json:"priority,omitempty"`
	DueDate       *string `json:"dueDate,omitempty"`
	Notes         *string `json:"notes,omitempty"`
}

// UpdateRemediationTaskRequest mirrors UpdateRemediationTaskRequestDto.
type UpdateRemediationTaskRequest struct {
	Owner    *string `json:"owner,omitempty"`
	Team     *string `json:"team,omitempty"`
	Priority *string `json:"priority,omitempty"`
	DueDate  *string `json:"dueDate,omitempty"`
	Notes    *string `json:"notes,omitempty"`
}

// ListRemediationFilter holds optional query filters for List.
type ListRemediationFilter struct {
	Status     string
	Priority   string
	ProjectID  string
	IncidentID string
	FindingID  string
	Limit      int
}

func (r *RemediationResource) List(ctx context.Context, filter ListRemediationFilter) ([]RemediationTask, error) {
	var out []RemediationTask
	params := map[string]string{
		"status": filter.Status, "priority": filter.Priority, "projectId": filter.ProjectID,
		"incidentId": filter.IncidentID, "findingId": filter.FindingID,
	}
	if filter.Limit > 0 {
		params["limit"] = fmt.Sprintf("%d", filter.Limit)
	}
	err := r.http.Get(ctx, "/remediation/tasks", Query(params), &out)
	return out, err
}

func (r *RemediationResource) Create(ctx context.Context, req CreateRemediationTaskRequest) (RemediationTask, error) {
	var out RemediationTask
	err := r.http.Post(ctx, "/remediation/tasks", req, &out)
	return out, err
}

func (r *RemediationResource) Get(ctx context.Context, id string) (RemediationTask, error) {
	var out RemediationTask
	err := r.http.Get(ctx, fmt.Sprintf("/remediation/tasks/%s", id), nil, &out)
	return out, err
}

func (r *RemediationResource) Update(ctx context.Context, id string, req UpdateRemediationTaskRequest) (RemediationTask, error) {
	var out RemediationTask
	err := r.http.Patch(ctx, fmt.Sprintf("/remediation/tasks/%s", id), req, &out)
	return out, err
}

func (r *RemediationResource) SetStatus(ctx context.Context, id, status string) (RemediationTask, error) {
	var out RemediationTask
	err := r.http.Patch(ctx, fmt.Sprintf("/remediation/tasks/%s/status", id), map[string]string{"status": status}, &out)
	return out, err
}

func (r *RemediationResource) LinkEvidence(ctx context.Context, id, evidenceID string) (RemediationEvidenceLink, error) {
	var out RemediationEvidenceLink
	err := r.http.Post(ctx, fmt.Sprintf("/remediation/tasks/%s/evidence", id), map[string]string{"evidenceId": evidenceID}, &out)
	return out, err
}

func (r *RemediationResource) GetFindingVerification(ctx context.Context, findingID string) (FindingVerification, error) {
	var out FindingVerification
	err := r.http.Get(ctx, fmt.Sprintf("/findings/%s/verification", findingID), nil, &out)
	return out, err
}

func (r *RemediationResource) SetFindingVerification(ctx context.Context, findingID, status string, verificationEvidenceID *string) (FindingVerification, error) {
	var out FindingVerification
	body := map[string]interface{}{"status": status}
	if verificationEvidenceID != nil {
		body["verificationEvidenceId"] = *verificationEvidenceID
	}
	err := r.http.Patch(ctx, fmt.Sprintf("/findings/%s/verification", findingID), body, &out)
	return out, err
}
