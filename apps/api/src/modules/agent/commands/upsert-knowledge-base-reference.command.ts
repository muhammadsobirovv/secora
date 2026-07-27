import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import type {
  KnowledgeBaseReferenceEntryDto,
  UpsertKnowledgeBaseReferenceEntryRequestDto,
} from '@pentesthub/shared';
import { KnowledgeBaseReferenceService } from '../knowledge-base/knowledge-base-reference.service.js';

/// Module 11 — Controllers + Swagger + module wiring + events (task #236).
/// System-wide catalog (not workspace-scoped) — see
/// KnowledgeBaseReferenceService's doc comment on why it's a "system-wide,
/// read-mostly canonical catalog," same posture as the built-in seed data.
export class UpsertKnowledgeBaseReferenceCommand implements ICommand {
  constructor(public readonly data: UpsertKnowledgeBaseReferenceEntryRequestDto) {}
}

@CommandHandler(UpsertKnowledgeBaseReferenceCommand)
export class UpsertKnowledgeBaseReferenceHandler
  implements ICommandHandler<UpsertKnowledgeBaseReferenceCommand, KnowledgeBaseReferenceEntryDto>
{
  constructor(private readonly knowledgeBase: KnowledgeBaseReferenceService) {}

  execute(command: UpsertKnowledgeBaseReferenceCommand): Promise<KnowledgeBaseReferenceEntryDto> {
    return this.knowledgeBase.upsertEntry(command.data);
  }
}
