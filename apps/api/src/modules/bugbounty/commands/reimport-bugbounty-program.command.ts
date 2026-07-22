import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type {
  DetectProgramUpdateRequestDto,
  ReimportProgramResultDto,
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
import { toBugBountyProgramDto } from '../mappers/to-bugbounty-program-dto.mapper.js';
import { BugBountyProgramUpdatedEvent } from '../events/bugbounty-program-events.js';
import { ProgramImporterRegistryService } from '../importers/program-importer-registry.service.js';
import { ProgramImportParseError } from '../importers/program-importer.interface.js';
import {
  computeImportFingerprint,
  diffProgramImport,
} from '../importers/program-update-detector.js';

/// The "apply" counterpart to DetectProgramImportUpdateQuery — same
/// parse + diff, but on a `changed` result it also: (1) updates the
/// program's core fields to the freshly parsed values, (2) adds any
/// scope items present in the new payload but not already tracked
/// (existing scope items are never removed or silently reclassified —
/// a human reviews drops via the diff and removes them explicitly
/// through the normal scope endpoints, consistent with Module 6's
/// existing "no destructive auto-classification" stance), and
/// (3) records the new fingerprint. A no-op reimport (nothing changed)
/// still records `lastImportedAt` — confirms the check ran — but skips
/// the update/scope-item writes entirely.
export class ReimportBugBountyProgramCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly programId: string,
    public readonly data: DetectProgramUpdateRequestDto,
  ) {}
}

@CommandHandler(ReimportBugBountyProgramCommand)
export class ReimportBugBountyProgramHandler
  implements ICommandHandler<ReimportBugBountyProgramCommand, ReimportProgramResultDto>
{
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_PROGRAMS_REPOSITORY)
    private readonly programsRepository: BugBountyProgramsRepository,
    private readonly importerRegistry: ProgramImporterRegistryService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    command: ReimportBugBountyProgramCommand,
  ): Promise<ReimportProgramResultDto> {
    const { workspaceId, program } = await resolveBugBountyProgramForCaller(
      this.workspacesRepository,
      this.programsRepository,
      command.userId,
      command.programId,
    );

    const importer = this.importerRegistry.get(command.data.source);
    let parsed;
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

    const existingScopeItems = await this.programsRepository.listScopeItems(
      program.id,
    );
    const { changed, diff } = diffProgramImport(
      program,
      existingScopeItems,
      parsed,
    );

    let scopeItemsAdded = 0;
    let current = program;

    if (changed) {
      current = await this.programsRepository.update(program.id, {
        name: parsed.name,
        organization: parsed.organization ?? null,
        url: parsed.url ?? null,
        rulesMarkdown: parsed.rulesMarkdown ?? null,
        disclosurePolicy: parsed.disclosurePolicy ?? null,
        tags: parsed.tags,
      });

      const existingPatterns = new Set(
        existingScopeItems.map((item) => `${item.type}:${item.pattern}`),
      );
      for (const item of parsed.scopeItems) {
        if (existingPatterns.has(`${item.type}:${item.pattern}`)) continue;
        await this.programsRepository.addScopeItem({
          programId: program.id,
          type: item.type,
          pattern: item.pattern,
          classification: item.classification,
          notes: item.notes,
        });
        scopeItemsAdded += 1;
      }

      this.eventBus.publish(
        new BugBountyProgramUpdatedEvent(
          workspaceId,
          current.projectId,
          command.userId,
          current.id,
          { reimported: true, scopeItemsAdded },
        ),
      );
    }

    current = await this.programsRepository.recordImport(current.id, {
      lastImportedAt: new Date(),
      importFingerprint: computeImportFingerprint(parsed),
    });

    const [scopeItemCount, targetCount] = await Promise.all([
      this.programsRepository.countScopeItems(current.id),
      this.programsRepository.countLinkedTargets(current.id),
    ]);

    return {
      program: toBugBountyProgramDto(current, {
        scopeItemCount,
        targetCount,
        findingCount: 0,
      }),
      changed,
      diff,
      scopeItemsAdded,
      warnings: parsed.warnings,
    };
  }
}
