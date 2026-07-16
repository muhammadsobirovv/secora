import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type {
  ImportProgramRequestDto,
  ImportProgramResultDto,
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
import { resolveWorkspaceForCaller } from '../authorization.util.js';
import { toBugBountyProgramDto } from '../mappers/to-bugbounty-program-dto.mapper.js';
import { BugBountyProgramCreatedEvent } from '../events/bugbounty-program-events.js';
import { ProgramImporterRegistryService } from '../importers/program-importer-registry.service.js';
import {
  ProgramImportParseError,
  type ParsedProgramImport,
} from '../importers/program-importer.interface.js';

export class ImportBugBountyProgramCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: ImportProgramRequestDto,
  ) {}
}

/// "The importer must normalize all platforms into one internal model" —
/// this handler is that seam: every ProgramImporter adapter returns the
/// same ParsedProgramImport shape regardless of source, so everything
/// past `registry.get(source).parse(raw)` is identical to a normal
/// CreateBugBountyProgramCommand plus a loop of addScopeItem() calls.
@CommandHandler(ImportBugBountyProgramCommand)
export class ImportBugBountyProgramHandler implements ICommandHandler<
  ImportBugBountyProgramCommand,
  ImportProgramResultDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_PROGRAMS_REPOSITORY)
    private readonly programsRepository: BugBountyProgramsRepository,
    private readonly importerRegistry: ProgramImporterRegistryService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    command: ImportBugBountyProgramCommand,
  ): Promise<ImportProgramResultDto> {
    const workspace = await resolveWorkspaceForCaller(
      this.workspacesRepository,
      command.userId,
    );

    const importer = this.importerRegistry.get(command.data.source);
    let parsed: ParsedProgramImport;
    try {
      parsed = importer.parse(command.data.raw);
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

    const program = await this.programsRepository.create({
      workspaceId: workspace.id,
      projectId: command.data.projectId,
      name: parsed.name,
      platform: parsed.platform,
      organization: parsed.organization,
      url: parsed.url,
      rulesMarkdown: parsed.rulesMarkdown,
      disclosurePolicy: parsed.disclosurePolicy,
      tags: parsed.tags,
      createdBy: command.userId,
    });

    for (const item of parsed.scopeItems) {
      await this.programsRepository.addScopeItem({
        programId: program.id,
        type: item.type,
        pattern: item.pattern,
        classification: item.classification,
        notes: item.notes,
      });
    }

    this.eventBus.publish(
      new BugBountyProgramCreatedEvent(
        workspace.id,
        program.projectId,
        command.userId,
        program.id,
        { platform: program.platform, name: program.name, imported: true },
      ),
    );

    return {
      program: toBugBountyProgramDto(program, {
        scopeItemCount: parsed.scopeItems.length,
        targetCount: 0,
        findingCount: 0,
      }),
      scopeItemsImported: parsed.scopeItems.length,
      warnings: parsed.warnings,
    };
  }
}
