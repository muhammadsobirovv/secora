import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type {
  DetectProgramUpdateRequestDto,
  DetectProgramUpdateResultDto,
} from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  BUGBOUNTY_PROGRAMS_REPOSITORY,
  type BugBountyProgramsRepository,
} from '../domain/repositories/bugbounty-programs.repository.interface.js';
import { resolveBugBountyProgramForCaller } from '../authorization.util.js';
import { ProgramImporterRegistryService } from '../importers/program-importer-registry.service.js';
import { ProgramImportParseError } from '../importers/program-importer.interface.js';
import { diffProgramImport } from '../importers/program-update-detector.js';

/// Read-only preview of what `ReimportBugBountyProgramCommand` would
/// change — parses the freshly supplied raw payload and diffs it
/// against the program as it's currently stored, without writing
/// anything. Lets a caller decide whether the reimport is worth
/// applying before committing to it.
export class DetectProgramImportUpdateQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly programId: string,
    public readonly data: DetectProgramUpdateRequestDto,
  ) {}
}

@QueryHandler(DetectProgramImportUpdateQuery)
export class DetectProgramImportUpdateHandler
  implements IQueryHandler<DetectProgramImportUpdateQuery, DetectProgramUpdateResultDto>
{
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_PROGRAMS_REPOSITORY)
    private readonly programsRepository: BugBountyProgramsRepository,
    private readonly importerRegistry: ProgramImporterRegistryService,
  ) {}

  async execute(
    query: DetectProgramImportUpdateQuery,
  ): Promise<DetectProgramUpdateResultDto> {
    const { program } = await resolveBugBountyProgramForCaller(
      this.workspacesRepository,
      this.programsRepository,
      query.userId,
      query.programId,
    );

    const importer = this.importerRegistry.get(query.data.source);
    let parsed;
    try {
      parsed = importer.parse(query.data.raw);
    } catch (error) {
      if (error instanceof ProgramImportParseError) {
        throw new AppException(
          'PROGRAM_IMPORT_FAILED',
          error.message,
          HttpStatus.BAD_REQUEST,
        );
      }
      throw error;
    }

    const existingScopeItems = await this.programsRepository.listScopeItems(
      program.id,
    );
    return diffProgramImport(program, existingScopeItems, parsed);
  }
}
