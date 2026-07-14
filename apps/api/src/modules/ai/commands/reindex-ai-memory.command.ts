import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import {
  VULN_FINDINGS_REPOSITORY,
  type VulnFindingsRepository,
} from '../../vuln/domain/repositories/vuln-findings.repository.interface.js';
import {
  RECON_FINDINGS_REPOSITORY,
  type ReconFindingsRepository,
} from '../../recon/domain/repositories/recon-findings.repository.interface.js';
import {
  NOTES_REPOSITORY,
  type NotesRepository,
} from '../../notes/domain/repositories/notes.repository.interface.js';
import { AiContextService } from '../context/ai-context.service.js';
import { AiMemoryService } from '../memory/ai-memory.service.js';

export class ReindexAiMemoryCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly projectId: string,
  ) {}
}

/// Manual "reindex this project's memory" action (RAG: "each Workspace and
/// Project must have isolated memory") — rebuilds the RAG store for every
/// finding/recon-finding/note in the project. Wiped-and-rebuilt rather
/// than diffed: indexContent() already deletes-then-reinserts by source,
/// so this is safe to run repeatedly (e.g. after bulk data changes) without
/// accumulating stale duplicate chunks.
@CommandHandler(ReindexAiMemoryCommand)
export class ReindexAiMemoryHandler implements ICommandHandler<
  ReindexAiMemoryCommand,
  { indexed: number }
> {
  constructor(
    @Inject(VULN_FINDINGS_REPOSITORY)
    private readonly vulnFindingsRepository: VulnFindingsRepository,
    @Inject(RECON_FINDINGS_REPOSITORY)
    private readonly reconFindingsRepository: ReconFindingsRepository,
    @Inject(NOTES_REPOSITORY) private readonly notesRepository: NotesRepository,
    private readonly contextService: AiContextService,
    private readonly memoryService: AiMemoryService,
  ) {}

  async execute(command: ReindexAiMemoryCommand): Promise<{ indexed: number }> {
    const { workspaceId, projectId } =
      await this.contextService.resolveWorkspaceAndProject(
        command.userId,
        command.projectId,
      );

    const [vulnFindings, reconFindings, notes] = await Promise.all([
      this.vulnFindingsRepository.list({ workspaceId, projectId, limit: 500 }),
      this.reconFindingsRepository.list({ workspaceId, projectId }),
      this.notesRepository.list(projectId),
    ]);

    let indexed = 0;
    for (const finding of vulnFindings) {
      await this.memoryService.indexContent({
        workspaceId,
        projectId,
        sourceType: 'FINDING',
        sourceId: finding.id,
        content: `${finding.title}\n\n${finding.description}`,
        metadata: { severity: finding.severity, status: finding.status },
      });
      indexed += 1;
    }
    for (const finding of reconFindings) {
      await this.memoryService.indexContent({
        workspaceId,
        projectId,
        sourceType: 'RECON_FINDING',
        sourceId: finding.id,
        content: `${finding.type}: ${finding.value}`,
        metadata: { source: finding.source },
      });
      indexed += 1;
    }
    for (const note of notes) {
      await this.memoryService.indexContent({
        workspaceId,
        projectId,
        sourceType: 'NOTE',
        sourceId: note.id,
        content: `${note.title ?? ''}\n\n${note.content}`,
      });
      indexed += 1;
    }

    return { indexed };
  }
}
