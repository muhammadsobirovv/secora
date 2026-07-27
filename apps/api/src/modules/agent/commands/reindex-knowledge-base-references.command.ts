import { Inject } from '@nestjs/common';
import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { KnowledgeBaseReferenceService } from '../knowledge-base/knowledge-base-reference.service.js';
import {
  resolveWorkspaceForCaller,
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../agent-authorization.util.js';

/// Module 11 — Controllers + Swagger + module wiring + events (task #236).
/// HTTP surface for the opt-in "fold the whole catalog into this
/// workspace's RAG store" path — see
/// KnowledgeBaseReferenceService.reindexForSemanticSearch's doc comment on
/// why it costs one embedding call per entry and is never run
/// automatically.
export class ReindexKnowledgeBaseReferencesCommand implements ICommand {
  constructor(public readonly userId: string) {}
}

@CommandHandler(ReindexKnowledgeBaseReferencesCommand)
export class ReindexKnowledgeBaseReferencesHandler
  implements ICommandHandler<ReindexKnowledgeBaseReferencesCommand, { indexed: number }>
{
  constructor(
    private readonly knowledgeBase: KnowledgeBaseReferenceService,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  async execute(command: ReindexKnowledgeBaseReferencesCommand): Promise<{ indexed: number }> {
    const workspace = await resolveWorkspaceForCaller(this.workspacesRepository, command.userId);
    const indexed = await this.knowledgeBase.reindexForSemanticSearch(workspace.id);
    return { indexed };
  }
}
