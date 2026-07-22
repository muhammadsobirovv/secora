package pentesthub

import (
	"context"
	"fmt"
)

// DistributedJobsResource covers the Distributed Job System's
// organization-scoped routes — mirrors DISTRIBUTED_JOB_ENDPOINTS in
// packages/shared/src/distributed-jobs-endpoints.ts. Worker-facing
// claim/complete/fail routes (X-API-Key auth, no organizationId in the
// path) are intentionally NOT wrapped here — they're for the worker
// runtime itself, not SDK consumers, matching the doc comment in
// apps/api/src/modules/graphql-api/resolvers/distributed-job.resolver.ts.
type DistributedJobsResource struct {
	http *HttpClient
}

// DistributedJob mirrors DistributedJobDto (packages/shared/src/distributed-jobs.ts).
type DistributedJob struct {
	ID             string                 `json:"id"`
	OrganizationID *string                `json:"organizationId"`
	WorkspaceID    *string                `json:"workspaceId"`
	Type           string                 `json:"type"`
	Payload        map[string]interface{} `json:"payload"`
	Priority       string                 `json:"priority"`
	Status         string                 `json:"status"`
	WorkerID       *string                `json:"workerId"`
	Attempts       int                    `json:"attempts"`
	MaxAttempts    int                    `json:"maxAttempts"`
	LastError      *string                `json:"lastError"`
	ScheduledFor   *string                `json:"scheduledFor"`
	StartedAt      *string                `json:"startedAt"`
	FinishedAt     *string                `json:"finishedAt"`
	CreatedAt      string                 `json:"createdAt"`
}

// JobEvent mirrors JobEventDto (packages/shared/src/distributed-jobs.ts).
type JobEvent struct {
	ID        string  `json:"id"`
	JobID     string  `json:"jobId"`
	WorkerID  *string `json:"workerId"`
	Type      string  `json:"type"`
	Message   *string `json:"message"`
	CreatedAt string  `json:"createdAt"`
}

// QueueMetrics mirrors QueueMetricsDto (packages/shared/src/distributed-jobs.ts).
type QueueMetrics struct {
	ByStatus      map[string]int `json:"byStatus"`
	ByPriority    map[string]int `json:"byPriority"`
	OnlineWorkers int            `json:"onlineWorkers"`
	TotalCapacity int            `json:"totalCapacity"`
	CurrentLoad   int            `json:"currentLoad"`
	AverageWaitMs *int           `json:"averageWaitMs"`
}

// EnqueueDistributedJobRequest mirrors EnqueueDistributedJobRequestDto.
type EnqueueDistributedJobRequest struct {
	Type     string                 `json:"type"`
	Priority string                 `json:"priority,omitempty"`
	Payload  map[string]interface{} `json:"payload,omitempty"`
}

// ListDistributedJobsFilter holds optional query filters for List.
type ListDistributedJobsFilter struct {
	Status string
	Type   string
}

func (d *DistributedJobsResource) List(ctx context.Context, organizationID string, filter ListDistributedJobsFilter) ([]DistributedJob, error) {
	var out []DistributedJob
	query := Query(map[string]string{"status": filter.Status, "type": filter.Type})
	err := d.http.Get(ctx, fmt.Sprintf("/enterprise/organizations/%s/distributed-jobs", organizationID), query, &out)
	return out, err
}

func (d *DistributedJobsResource) Get(ctx context.Context, organizationID, jobID string) (DistributedJob, error) {
	var out DistributedJob
	err := d.http.Get(ctx, fmt.Sprintf("/enterprise/organizations/%s/distributed-jobs/%s", organizationID, jobID), nil, &out)
	return out, err
}

func (d *DistributedJobsResource) Enqueue(ctx context.Context, organizationID string, req EnqueueDistributedJobRequest) (DistributedJob, error) {
	var out DistributedJob
	err := d.http.Post(ctx, fmt.Sprintf("/enterprise/organizations/%s/distributed-jobs", organizationID), req, &out)
	return out, err
}

func (d *DistributedJobsResource) Cancel(ctx context.Context, organizationID, jobID string) (DistributedJob, error) {
	var out DistributedJob
	err := d.http.Post(ctx, fmt.Sprintf("/enterprise/organizations/%s/distributed-jobs/%s/cancel", organizationID, jobID), nil, &out)
	return out, err
}

func (d *DistributedJobsResource) Events(ctx context.Context, organizationID, jobID string) ([]JobEvent, error) {
	var out []JobEvent
	err := d.http.Get(ctx, fmt.Sprintf("/enterprise/organizations/%s/distributed-jobs/%s/events", organizationID, jobID), nil, &out)
	return out, err
}

func (d *DistributedJobsResource) Metrics(ctx context.Context, organizationID string) (QueueMetrics, error) {
	var out QueueMetrics
	err := d.http.Get(ctx, fmt.Sprintf("/enterprise/organizations/%s/distributed-jobs/metrics", organizationID), nil, &out)
	return out, err
}
