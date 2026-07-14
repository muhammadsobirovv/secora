import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { TargetsModule } from '../targets/targets.module.js';
import { NotesModule } from '../notes/notes.module.js';
import { EvidenceModule } from '../evidence/evidence.module.js';
import { ActivityModule } from '../activity/activity.module.js';
import { ReconCoreModule } from '../recon/recon-core.module.js';
import { VulnCoreModule } from '../vuln/vuln-core.module.js';

import { AI_CONVERSATIONS_REPOSITORY } from './domain/repositories/ai-conversations.repository.interface.js';
import { PrismaAiConversationsRepository } from './infrastructure/persistence/prisma/prisma-ai-conversations.repository.js';
import { AI_MESSAGES_REPOSITORY } from './domain/repositories/ai-messages.repository.interface.js';
import { PrismaAiMessagesRepository } from './infrastructure/persistence/prisma/prisma-ai-messages.repository.js';
import { AI_TOOL_CALL_LOGS_REPOSITORY } from './domain/repositories/ai-tool-call-logs.repository.interface.js';
import { PrismaAiToolCallLogsRepository } from './infrastructure/persistence/prisma/prisma-ai-tool-call-logs.repository.js';
import { AI_MEMORY_REPOSITORY } from './domain/repositories/ai-memory.repository.interface.js';
import { PrismaAiMemoryRepository } from './infrastructure/persistence/prisma/prisma-ai-memory.repository.js';

import { OpenAiProvider } from './providers/adapters/openai.provider.js';
import { AnthropicProvider } from './providers/adapters/anthropic.provider.js';
import { GeminiProvider } from './providers/adapters/gemini.provider.js';
import { OllamaProvider } from './providers/adapters/ollama.provider.js';
import { OpenRouterProvider } from './providers/adapters/openrouter.provider.js';
import { AiProviderRegistryService } from './providers/ai-provider-registry.service.js';

import { WebSpeechProvider } from './speech/adapters/web-speech.provider.js';
import { OpenAiSpeechProvider } from './speech/adapters/openai-speech.provider.js';
import { AzureSpeechProvider } from './speech/adapters/azure-speech.provider.js';
import { GoogleSpeechProvider } from './speech/adapters/google-speech.provider.js';
import { ElevenLabsProvider } from './speech/adapters/elevenlabs.provider.js';
import { AiSpeechProviderRegistryService } from './speech/ai-speech-provider-registry.service.js';

import { AiPromptBuilderService } from './prompts/ai-prompt-builder.service.js';
import { AiContextService } from './context/ai-context.service.js';
import { AiMemoryService } from './memory/ai-memory.service.js';
import { PromptInjectionGuardService } from './security/prompt-injection-guard.service.js';

import { SearchFindingsTool } from './tools/search-findings.tool.js';
import { SearchReconDataTool } from './tools/search-recon-data.tool.js';
import { SearchEvidenceTool } from './tools/search-evidence.tool.js';
import { SearchNotesTool } from './tools/search-notes.tool.js';
import { SearchProjectsTool } from './tools/search-projects.tool.js';
import { SearchTargetsTool } from './tools/search-targets.tool.js';
import { SearchTemplatesTool } from './tools/search-templates.tool.js';
import { CreateNoteTool } from './tools/create-note.tool.js';
import { DraftReportTool } from './tools/draft-report.tool.js';
import { GeneratePocTool } from './tools/generate-poc.tool.js';
import { GeneratePayloadsTool } from './tools/generate-payloads.tool.js';
import { AiToolRegistryService } from './tools/ai-tool-registry.service.js';

import { AiChatStreamHubService } from './chat/ai-chat-stream-hub.service.js';
import { AiChatService } from './chat/ai-chat.service.js';
import { AiSummaryHandler } from './events/ai-summary.handler.js';

/// Everything the AI HTTP module needs, in one place — mirrors
/// VulnCoreModule/ReconCoreModule's "core module with no controllers"
/// shape, even though Module 5 (unlike 3/4) has no separate background
/// worker process yet: AI turns run inline within the HTTP request's
/// lifecycle (see AiChatService — generation is kicked off from the
/// controller's request but continues after the response returns,
/// broadcasting through AiChatStreamHubService rather than a DB-backed
/// job queue). Kept as its own module anyway for the same reason Module
/// 4 did: a future AI background job (e.g. a scheduled "summarize
/// overnight recon" task) would import this core module without pulling
/// in controllers.
@Module({
  imports: [
    WorkspacesModule,
    ProjectsModule,
    TargetsModule,
    NotesModule,
    EvidenceModule,
    ActivityModule,
    ReconCoreModule,
    VulnCoreModule,
  ],
  providers: [
    {
      provide: AI_CONVERSATIONS_REPOSITORY,
      useClass: PrismaAiConversationsRepository,
    },
    { provide: AI_MESSAGES_REPOSITORY, useClass: PrismaAiMessagesRepository },
    {
      provide: AI_TOOL_CALL_LOGS_REPOSITORY,
      useClass: PrismaAiToolCallLogsRepository,
    },
    { provide: AI_MEMORY_REPOSITORY, useClass: PrismaAiMemoryRepository },

    OpenAiProvider,
    AnthropicProvider,
    GeminiProvider,
    OllamaProvider,
    OpenRouterProvider,
    AiProviderRegistryService,

    WebSpeechProvider,
    OpenAiSpeechProvider,
    AzureSpeechProvider,
    GoogleSpeechProvider,
    ElevenLabsProvider,
    AiSpeechProviderRegistryService,

    AiPromptBuilderService,
    AiContextService,
    AiMemoryService,
    PromptInjectionGuardService,

    SearchFindingsTool,
    SearchReconDataTool,
    SearchEvidenceTool,
    SearchNotesTool,
    SearchProjectsTool,
    SearchTargetsTool,
    SearchTemplatesTool,
    CreateNoteTool,
    DraftReportTool,
    GeneratePocTool,
    GeneratePayloadsTool,
    AiToolRegistryService,

    AiChatStreamHubService,
    AiChatService,
    AiSummaryHandler,
  ],
  exports: [
    AI_CONVERSATIONS_REPOSITORY,
    AI_MESSAGES_REPOSITORY,
    AI_TOOL_CALL_LOGS_REPOSITORY,
    AI_MEMORY_REPOSITORY,
    AiProviderRegistryService,
    AiSpeechProviderRegistryService,
    AiPromptBuilderService,
    AiContextService,
    AiMemoryService,
    AiToolRegistryService,
    AiChatStreamHubService,
    AiChatService,
  ],
})
export class AiCoreModule {}
