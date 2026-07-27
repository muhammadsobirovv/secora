import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { KnowledgeBaseReferenceService } from '../knowledge-base/knowledge-base-reference.service.js';

/// Module 11 — Controllers + Swagger + module wiring + events (task #236).
export class DeleteKnowledgeBaseReferenceCommand implements ICommand {
  constructor(public readonly id: string) {}
}

@CommandHandler(DeleteKnowledgeBaseReferenceCommand)
export class DeleteKnowledgeBaseReferenceHandler
  implements ICommandHandler<DeleteKnowledgeBaseReferenceCommand, void>
{
  constructor(private readonly knowledgeBase: KnowledgeBaseReferenceService) {}

  execute(command: DeleteKnowledgeBaseReferenceCommand): Promise<void> {
    return this.knowledgeBase.deleteEntry(command.id);
  }
}
