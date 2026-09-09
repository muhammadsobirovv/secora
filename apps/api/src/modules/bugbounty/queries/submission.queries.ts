import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type { SubmissionDto, SubmissionStatus } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  SUBMISSIONS_REPOSITORY,
  type SubmissionsRepository,
} from '../domain/repositories/submissions.repository.interface.js';
import { resolveWorkspaceForCaller } from '../authorization.util.js';
import { toSubmissionDto } from '../mappers/to-submission-dto.mapper.js';

export interface ListSubmissionsFilterDto {
  programId?: string;
  findingId?: string;
  status?: string;
}

export class ListSubmissionsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly filter: ListSubmissionsFilterDto,
  ) {}
}

@QueryHandler(ListSubmissionsQuery)
export class ListSubmissionsHandler implements IQueryHandler<
  ListSubmissionsQuery,
  SubmissionDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(SUBMISSIONS_REPOSITORY)
    private readonly submissionsRepository: SubmissionsRepository,
  ) {}

  async execute(query: ListSubmissionsQuery): Promise<SubmissionDto[]> {
    const workspace = await resolveWorkspaceForCaller(
      this.workspacesRepository,
      query.userId,
    );
    const submissions = await this.submissionsRepository.list({
      workspaceId: workspace.id,
      programId: query.filter.programId,
      findingId: query.filter.findingId,
      // ListSubmissionsQueryParamsDto's @IsIn(SUBMISSION_STATUSES) already
      // validates this against the exact enum member list.
      status: query.filter.status as SubmissionStatus | undefined,
    });
    return submissions.map(toSubmissionDto);
  }
}

export class GetSubmissionQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly submissionId: string,
  ) {}
}

/// Enumeration-safe: a submission that doesn't exist and one that belongs
/// to another workspace both 404 identically — same pattern as
/// resolveBugBountyFindingForCaller, applied inline here since Submission
/// doesn't have its own resolve*ForCaller helper (it's never referenced
/// by id from another aggregate the way Program/Finding/BugReport are).
@QueryHandler(GetSubmissionQuery)
export class GetSubmissionHandler implements IQueryHandler<
  GetSubmissionQuery,
  SubmissionDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(SUBMISSIONS_REPOSITORY)
    private readonly submissionsRepository: SubmissionsRepository,
  ) {}

  async execute(query: GetSubmissionQuery): Promise<SubmissionDto> {
    const workspace = await resolveWorkspaceForCaller(
      this.workspacesRepository,
      query.userId,
    );
    const submission = await this.submissionsRepository.findByIdForWorkspace(
      query.submissionId,
      workspace.id,
    );
    if (!submission) {
      throw new AppException('SUBMISSION_NOT_FOUND', 'Submission not found.', HttpStatus.NOT_FOUND);
    }
    return toSubmissionDto(submission);
  }
}
