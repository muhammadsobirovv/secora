import { HttpStatus, Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type {
  ListPayloadLibraryQueryDto,
  PayloadLibraryEntryDto,
} from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  PAYLOAD_LIBRARY_REPOSITORY,
  type PayloadLibraryRepository,
} from '../domain/repositories/payload-library.repository.interface.js';
import { resolveWorkspaceForCaller } from '../authorization.util.js';
import { toPayloadLibraryEntryDto } from '../mappers/to-payload-library-entry-dto.mapper.js';

export class ListPayloadLibraryQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly filter: ListPayloadLibraryQueryDto,
  ) {}
}

@QueryHandler(ListPayloadLibraryQuery)
export class ListPayloadLibraryHandler implements IQueryHandler<
  ListPayloadLibraryQuery,
  PayloadLibraryEntryDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PAYLOAD_LIBRARY_REPOSITORY)
    private readonly payloadLibraryRepository: PayloadLibraryRepository,
  ) {}

  async execute(
    query: ListPayloadLibraryQuery,
  ): Promise<PayloadLibraryEntryDto[]> {
    const workspace = await resolveWorkspaceForCaller(
      this.workspacesRepository,
      query.userId,
    );

    const entries = await this.payloadLibraryRepository.list({
      workspaceId: workspace.id,
      category: query.filter.category,
      search: query.filter.search,
      tag: query.filter.tag,
    });

    return entries.map(toPayloadLibraryEntryDto);
  }
}

export class GetPayloadLibraryEntryQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly entryId: string,
  ) {}
}

/// Read access follows the same "visible" rule as ExplainPayloadHandler
/// (seed entries readable by every workspace, custom entries only by
/// their own) rather than the stricter "owned" rule update/delete use.
@QueryHandler(GetPayloadLibraryEntryQuery)
export class GetPayloadLibraryEntryHandler implements IQueryHandler<
  GetPayloadLibraryEntryQuery,
  PayloadLibraryEntryDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PAYLOAD_LIBRARY_REPOSITORY)
    private readonly payloadLibraryRepository: PayloadLibraryRepository,
  ) {}

  async execute(
    query: GetPayloadLibraryEntryQuery,
  ): Promise<PayloadLibraryEntryDto> {
    const workspace = await resolveWorkspaceForCaller(
      this.workspacesRepository,
      query.userId,
    );
    const entry = await this.payloadLibraryRepository.findById(query.entryId);
    if (
      !entry ||
      (entry.workspaceId !== null && entry.workspaceId !== workspace.id)
    ) {
      throw new AppException(
        'PAYLOAD_LIBRARY_ENTRY_NOT_FOUND',
        'Payload library entry not found.',
        HttpStatus.NOT_FOUND,
      );
    }
 