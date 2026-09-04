import { HttpStatus, Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type {
  ClassifyScopeRequestDto,
  ScopeClassificationResultDto,
} from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  TARGETS_REPOSITORY,
  type TargetsRepository,
} from '../../targets/domain/repositories/targets.repository.interface.js';
import {
  PROJECTS_REPOSITORY,
  type ProjectsRepository,
} from '../../projects/domain/repositories/projects.repository.interface.js';
import {
  BUGBOUNTY_PROGRAMS_REPOSITORY,
  type BugBountyProgramsRepository,
} from '../domain/repositories/bugbounty-programs.repository.interface.js';
import { resolveBugBountyProgramForCaller } from '../authorization.util.js';
import { resolveTargetForCaller } from '../../targets/commands/target-lifecycle.commands.js';
import { classifyScopeValue } from '../scope/classify-scope-value.util.js';

export class ClassifyScopeValueQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly programId: string,
    public readonly data: ClassifyScopeRequestDto,
  ) {}
}

/// Scope Manager's "Automatically classify: In Scope / Out of Scope /
/// Unknown" requirement — a read-only computation over the program's
/// current scope rules (classifyScopeValue), not a persisted column,
/// since a Target's in/out-of-scope status can change the moment a scope
/// rule is edited and shouldn't go stale in storage. `targetId` resolves
/// through the target's own `value` column; `value` classifies an
/// arbitrary ad-hoc string with no Target required.
@QueryHandler(ClassifyScopeValueQuery)
export class ClassifyScopeValueHandler implements IQueryHandler<
  ClassifyScopeValueQuery,
  ScopeClassificationResultDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(TARGETS_REPOSITORY)
    private readonly targetsRepository: TargetsRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(BUGBOUNTY_PROGRAMS_REPOSITORY)
    private readonly programsRepository: BugBountyProgramsRepository,
  ) {}

  async execute(
    query: ClassifyScopeValueQuery,
  ): Promise<ScopeClassificationResultDto> {
    await resolveBugBountyProgramForCaller(
      this.workspacesRepository,
      this.programsRepository,
      query.userId,
      query.programId,
    );

    let value = query.data.value;
    if (!value && query.data.targetId) {
      // Module 18 — task #508 (IDOR sweep). Was a bare `findById(targetId)`
      // with no ownership check — a caller could supply another
      // workspace's targetId and have its value classified/returned via
      // this program's scope rules. Reuse the same enumeration-safe
      // resolver every other Target-scoped command uses; not-found and
      // not-owned both surface as the same TARGET_NOT_FOUND either way.
      const { target } = await resolveTargetForCaller(
        this.workspacesRepository,
        this.projectsRepository,
        this.targetsRepository,
        query.userId,
        query.data.targetId,
      );
      value = target.value;
    }
    if (!value) {
      throw new AppException(
        'INVALID_REFERENCE',
        'Either value or targetId must be provided.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const scopeItems = await this.programsRepository.listScopeItems(
      query.programId,
    );
    return classifyScopeValue(value, scopeItems);
  }
}
