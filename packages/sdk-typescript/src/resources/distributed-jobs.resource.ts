import { DISTRIBUTED_JOB_ENDPOINTS } from '@pentesthub/shared';
import type {
  DistributedJobDto,
  DistributedJobStatus,
  EnqueueDistributedJobRequestDto,
  JobEventDto,
  QueueMetricsDto,
} from '@pentesthub/shared';
import type { HttpClient } from '../http-client.js';

export class DistributedJobsResource {
  constructor(private readonly http: HttpClient) {}

  list(organizationId: string, filter?: { status?: DistributedJobStatus; type?: string }): Promise<DistributedJobDto[]> {
    return this.http.get<DistributedJobDto[]>(DISTRIBUTED_JOB_ENDPOINTS.list(organizationId), filter);
  }

  get(organizationId: string, jobId: string): Promise<DistributedJobDto> {
    return this.http.get<DistributedJobDto>(DISTRIBUTED_JOB_ENDPOINTS.get(organizationId, jobId));
  }

  enqueue(organizationId: string, data: EnqueueDistributedJobRequestDto): Promise<DistributedJobDto> {
    return this.http.post<DistributedJobDto>(DISTRIBUTED_JOB_ENDPOINTS.enqueue(organizationId), data);
  }

  cancel(organizationId: string, jobId: string): Promise<DistributedJobDto> {
    return this.http.post<DistributedJobDto>(DISTRIBUTED_JOB_ENDPOINTS.cancel(organizationId, jobId));
  }

  events(organizationId: string, jobId: string): Promise<JobEventDto[]> {
    return this.http.get<JobEventDto[]>(DISTRIBUTED_JOB_ENDPOINTS.events(organizationId, jobId));
  }

  metrics(organizationId: string): Promise<QueueMetricsDto> {
    return this.http.get<QueueMetricsDto>(DISTRIBUTED_JOB_ENDPOINTS.metrics(organizationId));
  }
}
