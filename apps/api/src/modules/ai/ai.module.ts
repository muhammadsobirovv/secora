import { Module } from '@nestjs/common';
import { AiCoreModule } from './ai-core.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { VulnCoreModule } from '../vuln/vuln-core.module.js';
import { ReconCoreModule } from '../recon/recon-core.module.js';
import { NotesModule } from '../notes/notes.module.js';

import { CreateAiConversationHandler } from './commands/create-ai-conversation.command.js';
import { DeleteAiConversationHandler } from './commands/delete-ai-conversation.command.js';
import { PinAiConversationHandler } from './commands/pin-ai-conversation.command.js';
import { ArchiveAiConversationHandler } from './commands/archive-ai-conversation.command.js';
import { SendAiMessageHandler } from './commands/send-ai-message.command.js';
import { RegenerateAiMessageHandler } from './commands/regenerate-ai-message.command.js';
import { ContinueAiMessageHandler } from './commands/continue-ai-message.command.js';
import { CancelAiGenerationHandler } from './commands/cancel-ai-generation.command.js';
import { BookmarkAiMessageHandler } from './commands/bookmark-ai-message.command.js';
import { PinAiMessageHandler } from './commands/pin-ai-message.command.js';
import { DeleteAiMessageHandler } from './commands/delete-ai-message.command.js';
import { ReindexAiMemoryHandler } from './commands/reindex-ai-memory.command.js';

import { ListAiConversationsHandler } from './queries/list-ai-conversations.query.js';
import { GetAiConversationHandler } from './queries/get-ai-conversation.query.js';
import { ListAiProvidersHandler } from './queries/list-ai-providers.query.js';
import { ListAiSpeechProvidersHandler } from './queries/list-ai-speech-providers.query.js';
import { GetAiContextSummaryHandler } from './queries/get-ai-context-summary.query.js';
import { GetAiSuggestedQuestionsHandler } from './queries/get-ai-suggested-questions.query.js';
import { SearchAiMemoryHandler } from './queries/search-ai-memory.query.js';

import { AiConversationsController } from './controllers/ai-conversations.controller.js';
import { AiMessagesController } from './controllers/ai-messages.controller.js';
import { AiProvidersController } from './controllers/ai-providers.controller.js';
import { AiSpeechController } from './controllers/ai-speech.controller.js';
import { AiContextController } from './controllers/ai-context.controller.js';
import { AiMemoryController } from './controllers/ai-memory.controller.js';

/// The HTTP-facing half of Module 5 — AiCoreModule's providers plus
/// controllers and CQRS handlers. Same "core module + HTTP module" split
/// as VulnModule/ReconModule, for the same reason (see AiCoreModule's doc
/// comment): keeps the door open for a future background AI job without
/// restructuring.
@Module({
  imports: [
    AiCoreModule,
    WorkspacesModule,
    ProjectsModule,
    // ReindexAiMemoryHandler (below) injects these repositories directly —
    // AiCoreModule imports VulnCoreModule/ReconCoreModule/NotesModule for
    // its *own* internal use but doesn't re-export their tokens, so this
    // module needs them too (NestJS module encapsulation: each module that
    // directly injects a token must have the providing module in its own
    // `imports`, re-import is idempotent/safe).
    VulnCoreModule,
    ReconCoreModule,
    NotesModule,
  ],
  controllers: [
    AiConversationsController,
    AiMessagesController,
    AiProvidersController,
    AiSpeechController,
    AiContextController,
    AiMemoryController,
  ],
  providers: [
    CreateAiConversationHandler,
    DeleteAiConversationHandler,
    PinAiConversationHandler,
    ArchiveAiConversationHandler,
    SendAiMessageHandler,
    RegenerateAiMessageHandler,
    ContinueAiMessageHandler,
    CancelAiGenerationHandler,
    BookmarkAiMessageHandler,
    PinAiMessageHandler,
    DeleteAiMessageHandler,
    ReindexAiMemoryHandler,

    ListAiConversationsHandler,
    GetAiConversationHandler,
    ListAiProvidersHandler,
    ListAiSpeechProvidersHandler,
    GetAiContextSummaryHandler,
    GetAiSuggestedQuestionsHandler,
    SearchAiMemoryHandler,
  ],
})
export class AiModule {}
