import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { ReconJobCompletedEvent } from '../../recon/events/recon-job-events.js';
import {
  VulnFindingCreatedEvent,
  VulnFindingResolvedEvent,
  VulnFindingUpdatedEvent,
} from '../../vuln/events/vuln-finding-events.js';
import {
  VULN_FINDINGS_REPOSITORY,
  type VulnFindingsRepository,
} from '../../vuln/domain/repositories/vuln-findings.repository.interface.js';
import {
  AI_CONVERSATIONS_REPOSITORY,
  type AiConversationsRepository,
} from '../domain/repositories/ai-conversations.repository.interface.js';
import {
  AI_MESSAGES_REPOSITORY,
  type AiMessagesRepository,
} from '../domain/repositories/ai-messages.repository.interface.js';
import { AiProviderRegistryService } from '../providers/ai-provider-registry.service.js';
import { AiProviderNotConfiguredError } from '../providers/ai-provider.interface.js';
import { collectStreamedCompletion } from '../providers/collect-stream.util.js';
import { AiPromptBuilderService } from '../prompts/ai-prompt-builder.service.js';
import { AiMemoryService } from '../memory/ai-memory.service.js';

const SUMMARY_CONVERSATION_TITLE = 'Activity Summaries';
const SUMMARIZE_SEVERITIES = new Set(['CRITICAL', 'HIGH']);

type SummaryTriggerEvent =
  ReconJobCompletedEvent | VulnFindingCreatedEvent | VulnFindingResolvedEvent;

/// Event Integration: "Subscribe to existing events: ReconFinished,
/// FindingCreated, FindingUpdated, FindingResolved. Automatically
/// generate AI summaries when useful." All four are subscribed below;
/// "when useful" is applied per-event-type rather than firing an LLM call
/// on every single event (a scan can produce dozens of findings in
/// seconds — summarizing each individually would be both noisy and
/// expensive):
///  - ReconJobCompletedEvent ("ReconFinished"): always summarized — one
///    per completed job, naturally low-frequency.
///  - VulnFindingCreatedEvent: summarized only for CRITICAL/HIGH severity
///    (fetched fresh, since the event itself only carries the id) — a
///    LOW/INFO content-discovery hit isn't worth an AI turn.
///  - VulnFindingUpdatedEvent: intentionally a no-op. This fires on every
///    re-match of an already-known finding (Module 4: "published on every
///    re-match... NOT published for an analyst-driven status change"),
///    which happens on every re-scan regardless of whether anything
///    meaningful changed — genuinely not "useful" to summarize. Still
///    registered in @EventsHandler so a future refinement (e.g. summarize
///    only when severity increased) doesn't need a new registration.
///  - VulnFindingResolvedEvent: no LLM call (a resolution doesn't need
///    narration); instead re-indexes the finding's RAG memory so status
///    changes are reflected in future retrieval.
///
/// Runs in both the API process (AppModule, via AiModule -> AiCoreModule)
/// and the worker process (WorkerModule) for the same reason
/// ActivityRecordingHandler does — @nestjs/cqrs's EventBus doesn't cross
/// OS-process boundaries, and Vuln/Recon jobs execute in the worker.
@EventsHandler(
  ReconJobCompletedEvent,
  VulnFindingCreatedEvent,
  VulnFindingUpdatedEvent,
  VulnFindingResolvedEvent,
)
export class AiSummaryHandler implements IEventHandler<SummaryTriggerEvent> {
  private readonly logger = new Logger(AiSummaryHandler.name);

  constructor(
    @Inject(VULN_FINDINGS_REPOSITORY)
    private readonly vulnFindingsRepository: VulnFindingsRepository,
    @Inject(AI_CONVERSATIONS_REPOSITORY)
    private readonly conversationsRepository: AiConversationsRepository,
    @Inject(AI_MESSAGES_REPOSITORY)
    private readonly messagesRepository: AiMessagesRepository,
    private readonly providerRegistry: AiProviderRegistryService,
    private readonly promptBuilder: AiPromptBuilderService,
    private readonly memoryService: AiMemoryService,
  ) {}

  async handle(event: SummaryTriggerEvent): Promise<void> {
    try {
      if (event instanceof ReconJobCompletedEvent) {
        await this.summarizeReconJob(event);
      } else if (event instanceof VulnFindingCreatedEvent) {
        await this.summarizeNewFinding(event);
      } else if (event instanceof VulnFindingResolvedEvent) {
        await this.reindexResolvedFinding(event);
      }
      // VulnFindingUpdatedEvent: intentionally no-op — see class doc comment.
    } catch (error) {
      if (error instanceof AiProviderNotConfiguredError) {
        this.logger.debug(
          `Skipping AI auto-summary — no provider configured yet.`,
        );
        return;
      }
      this.logger.warn(
        `AI auto-summary failed for ${event.entityType}:${event.entityId}: ${String(error)}`,
      );
    }
  }

  private async summarizeReconJob(
    event: ReconJobCompletedEvent,
  ): Promise<void> {
    if (!event.actorUserId) return;
    const provider = this.providerRegistry.resolveProvider();
    const summary = await collectStreamedCompletion(provider, {
      model: provider.getDefaultModel(),
      maxTokens: 800,
      messages: [
        {
          role: 'system',
          content: this.promptBuilder.buildModePrompt('recon'),
        },
        {
          role: 'user',
          content: `A reconnaissance job (id: ${event.jobId}) just completed for this project. Briefly summarize what's most worth the analyst's attention and suggest one concrete next step.`,
        },
      ],
    });
    await this.postSummary(
      event.workspaceId,
      event.projectId,
      event.actorUserId,
      summary,
    );
  }

  private async summarizeNewFinding(
    event: VulnFindingCreatedEvent,
  ): Promise<void> {
    if (!event.actorUserId) return;
    const finding = await this.vulnFindingsRepository.findById(event.findingId);
    if (!finding || !SUMMARIZE_SEVERITIES.has(finding.severity)) return;

    const provider = this.providerRegistry.resolveProvider();
    const summary = await collectStreamedCompletion(provider, {
      model: provider.getDefaultModel(),
      maxTokens: 600,
      messages: [
        {
          role: 'system',
          content: this.promptBuilder.buildModePrompt('finding'),
        },
        {
          role: 'user',
          content: `A new ${finding.severity} severity finding was just discovered: "${finding.title}". ${finding.description}\n\nBriefly explain the risk and suggest an immediate next step.`,
        },
      ],
    });
    await this.postSummary(
      event.workspaceId,
      event.projectId,
      event.actorUserId,
      summary,
    );
  }

  private async reindexResolvedFinding(
    event: VulnFindingResolvedEvent,
  ): Promise<void> {
    const finding = await this.vulnFindingsRepository.findById(event.findingId);
    if (!finding) return;
    await this.memoryService.indexContent({
      workspaceId: event.workspaceId,
      projectId: event.projectId,
      sourceType: 'FINDING',
      sourceId: finding.id,
      content: `${finding.title}\n\n${finding.description}`,
      metadata: { severity: finding.severity, status: finding.status },
    });
  }

  private async postSummary(
    workspaceId: string,
    projectId: string,
    userId: string,
    content: string,
  ): Promise<void> {
    if (!content.trim()) return;
    const existing = await this.conversationsRepository.list({
      workspaceId,
      projectId,
      userId,
      search: SUMMARY_CONVERSATION_TITLE,
      limit: 1,
    });
    const conversation =
      existing[0] ??
      (await this.conversationsRepository.create({
        workspaceId,
        projectId,
        userId,
        title: SUMMARY_CONVERSATION_TITLE,
      }));

    await this.messagesRepository.create({
      conversationId: conversation.id,
      role: 'ASSISTANT',
      content,
      status: 'COMPLETE',
    });
    await this.conversationsRepository.touch(conversation.id);
  }
}
