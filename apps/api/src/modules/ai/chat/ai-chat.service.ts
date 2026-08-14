import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Subject } from 'rxjs';
import type { AiChatStreamEvent } from './ai-chat-stream-event.js';
import type { EnvConfig } from '../../../config/env.validation.js';
import {
  AI_CONVERSATIONS_REPOSITORY,
  type AiConversationRecord,
  type AiConversationsRepository,
} from '../domain/repositories/ai-conversations.repository.interface.js';
import {
  AI_MESSAGES_REPOSITORY,
  type AiMessageRecord,
  type AiMessagesRepository,
} from '../domain/repositories/ai-messages.repository.interface.js';
import {
  AI_TOOL_CALL_LOGS_REPOSITORY,
  type AiToolCallLogsRepository,
} from '../domain/repositories/ai-tool-call-logs.repository.interface.js';
import { AiContextService } from '../context/ai-context.service.js';
import { AiMemoryService } from '../memory/ai-memory.service.js';
import { AiPromptBuilderService } from '../prompts/ai-prompt-builder.service.js';
import { AiProviderRegistryService } from '../providers/ai-provider-registry.service.js';
import {
  AiPrivacyModeViolationError,
  AiProviderNotConfiguredError,
  AiProviderRequestError,
} from '../providers/ai-provider.interface.js';
import type { AiChatMessage } from '../providers/ai-provider.interface.js';
import { AiToolRegistryService } from '../tools/ai-tool-registry.service.js';
import {
  findToolCall,
  mightContainToolCall,
  type ParsedToolCall,
} from '../tools/tool-call-parser.util.js';
import { PromptInjectionGuardService } from '../security/prompt-injection-guard.service.js';
import { AiChatStreamHubService } from './ai-chat-stream-hub.service.js';
import { toAiMessageDto } from '../mappers/to-ai-message-dto.mapper.js';
import type { AiMessageDto } from '@pentesthub/shared';
import { AiBudgetEnforcerService } from '../../billing/ai-cost/ai-budget-enforcer.service.js';

const MAX_TOOL_CALLS_PER_TURN = 3;

export interface StartTurnResult {
  userMessage: AiMessageDto;
  assistantMessage: AiMessageDto;
}

/// Orchestrates one full AI turn: build context -> build prompt -> stream
/// from the resolved provider -> detect+execute tool calls
/// provider-agnostically -> persist -> broadcast to the SSE hub. This is
/// the one place all the other AI-module pieces (context, RAG, prompts,
/// providers, tools, security) compose together — commands/controllers
/// never talk to those pieces directly.
@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  constructor(
    @Inject(AI_CONVERSATIONS_REPOSITORY)
    private readonly conversationsRepository: AiConversationsRepository,
    @Inject(AI_MESSAGES_REPOSITORY)
    private readonly messagesRepository: AiMessagesRepository,
    @Inject(AI_TOOL_CALL_LOGS_REPOSITORY)
    private readonly toolCallLogsRepository: AiToolCallLogsRepository,
    private readonly contextService: AiContextService,
    private readonly memoryService: AiMemoryService,
    private readonly promptBuilder: AiPromptBuilderService,
    private readonly providerRegistry: AiProviderRegistryService,
    private readonly toolRegistry: AiToolRegistryService,
    private readonly injectionGuard: PromptInjectionGuardService,
    private readonly streamHub: AiChatStreamHubService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly budgetEnforcer: AiBudgetEnforcerService,
  ) {}

  /// Creates the user + placeholder assistant rows synchronously, then
  /// kicks off generation in the background (not awaited) — the HTTP
  /// handler returns immediately so the frontend can open the SSE stream
  /// for the assistant message right away (Streaming Chat).
  async startTurn(
    conversationId: string,
    userId: string,
    content: string,
  ): Promise<StartTurnResult> {
    const conversation = await this.getConversationOrThrow(conversationId);
    const sanitizedContent = this.injectionGuard.sanitizeUserMessage(content);

    const userMessage = await this.messagesRepository.create({
      conversationId,
      role: 'USER',
      content: sanitizedContent,
    });
    const assistantMessage = await this.messagesRepository.create({
      conversationId,
      role: 'ASSISTANT',
      content: '',
      status: 'PENDING',
      provider: conversation.provider,
      model: conversation.model,
    });
    await this.conversationsRepository.touch(conversationId);

    this.streamHub.start(assistantMessage.id);
    void this.runGeneration(conversation, assistantMessage.id, userId);

    return {
      userMessage: toAiMessageDto(userMessage),
      assistantMessage: toAiMessageDto(assistantMessage),
    };
  }

  async regenerate(
    conversationId: string,
    assistantMessageId: string,
    userId: string,
  ): Promise<AiMessageDto> {
    const conversation = await this.getConversationOrThrow(conversationId);
    await this.messagesRepository.update(assistantMessageId, {
      content: '',
      status: 'PENDING',
      errorMessage: null,
    });
    const message = await this.messagesRepository.findById(assistantMessageId);
    if (!message) throw new Error('Assistant message not found');

    this.streamHub.start(assistantMessageId);
    void this.runGeneration(conversation, assistantMessageId, userId, {
      mode: 'regenerate',
    });
    return toAiMessageDto(message);
  }

  async continueGeneration(
    conversationId: string,
    assistantMessageId: string,
    userId: string,
  ): Promise<AiMessageDto> {
    const conversation = await this.getConversationOrThrow(conversationId);
    const message = await this.messagesRepository.findById(assistantMessageId);
    if (!message) throw new Error('Assistant message not found');
    await this.messagesRepository.update(assistantMessageId, {
      status: 'PENDING',
    });

    this.streamHub.start(assistantMessageId);
    void this.runGeneration(conversation, assistantMessageId, userId, {
      mode: 'continue',
      existingContent: message.content,
    });
    return toAiMessageDto(message);
  }

  /// Module 11 — AI Chat conversation branching (Support Branching
  /// Conversations). Forks off `parentMessageId` (an earlier message in
  /// the same conversation) rather than appending to the trunk: the new
  /// user message and its assistant reply both carry `parentMessageId`
  /// set to the message being forked from (not chained to each other),
  /// so `AiMessagesRepository.listBranches(parentMessageId)` returns them
  /// together as one branch attempt — a second "edit and resend" off the
  /// same fork point produces a second such pair, and the frontend can
  /// render every attempt alongside the original trunk message. Same
  /// fire-and-forget "create rows, kick off generation, return
  /// immediately" shape as startTurn.
  async branchTurn(
    conversationId: string,
    parentMessageId: string,
    userId: string,
    content: string,
  ): Promise<StartTurnResult> {
    const conversation = await this.getConversationOrThrow(conversationId);
    const sanitizedContent = this.injectionGuard.sanitizeUserMessage(content);

    const userMessage = await this.messagesRepository.create({
      conversationId,
      role: 'USER',
      content: sanitizedContent,
      parentMessageId,
    });
    const assistantMessage = await this.messagesRepository.create({
      conversationId,
      role: 'ASSISTANT',
      content: '',
      status: 'PENDING',
      provider: conversation.provider,
      model: conversation.model,
      parentMessageId,
    });
    await this.conversationsRepository.touch(conversationId);

    const trunkHistory = await this.resolveBranchHistory(
      conversationId,
      parentMessageId,
    );

    this.streamHub.start(assistantMessage.id);
    void this.runGeneration(conversation, assistantMessage.id, userId, {
      mode: 'branch',
      historyMessages: [...trunkHistory, userMessage],
    });

    return {
      userMessage: toAiMessageDto(userMessage),
      assistantMessage: toAiMessageDto(assistantMessage),
    };
  }

  cancel(assistantMessageId: string): boolean {
    return this.streamHub.cancel(assistantMessageId);
  }

  /// Resolves the trunk history a branch's generation should see: every
  /// non-branched (`parentMessageId === null`) message up to and
  /// including the fork point's own position in the trunk. If the fork
  /// point itself is already a branch reply (its own `parentMessageId`
  /// is set), this flattens one level by anchoring on *its* parent
  /// instead — deliberately not full recursive ancestor resolution
  /// (branch-off-a-branch-off-a-branch), which is out of scope for this
  /// task; a single level covers "edit and resend" and "regenerate this
  /// point," the two flows the spec actually calls for.
  private async resolveBranchHistory(
    conversationId: string,
    forkPointId: string,
  ): Promise<AiMessageRecord[]> {
    const all = await this.messagesRepository.listForConversation(conversationId);
    const forkPoint = all.find((m) => m.id === forkPointId);
    if (!forkPoint) return all;

    const anchorId = forkPoint.parentMessageId ?? forkPoint.id;
    const anchor = all.find((m) => m.id === anchorId) ?? forkPoint;

    return all.filter(
      (m) =>
        m.parentMessageId === null &&
        m.createdAt.getTime() <= anchor.createdAt.getTime(),
    );
  }

  private async getConversationOrThrow(
    conversationId: string,
  ): Promise<AiConversationRecord> {
    const conversation =
      await this.conversationsRepository.findById(conversationId);
    if (!conversation) throw new Error('Conversation not found');
    return conversation;
  }

  private async runGeneration(
    conversation: AiConversationRecord,
    assistantMessageId: string,
    userId: string,
    options?: {
      mode?: 'regenerate' | 'continue' | 'branch';
      existingContent?: string;
      /// Module 11 — branching: when set (branchTurn's call), this exact
      /// list is used as conversation history instead of the trunk's
      /// full listForConversation() — see resolveBranchHistory's doc
      /// comment for why a branch's context isn't just "everything in
      /// the conversation so far."
      historyMessages?: AiMessageRecord[];
    },
  ): Promise<void> {
    const stream = this.streamHub.get(assistantMessageId);
    if (!stream) return;
    const { subject, controller } = stream;

    try {
      const priorMessages = options?.historyMessages
        ? options.historyMessages
        : (
            await this.messagesRepository.listForConversation(conversation.id)
          ).filter((m) => m.id !== assistantMessageId);
      const latestUserMessage = [...priorMessages]
        .reverse()
        .find((m) => m.role === 'USER');
      const latestUserContent = latestUserMessage?.content ?? '';

      const context = await this.contextService.buildContext(
        conversation.workspaceId,
        conversation.projectId,
      );
      context.relevantMemory = await this.memoryService.search(
        conversation.workspaceId,
        latestUserContent,
        {
          projectId: conversation.projectId,
          topK: this.configService.get('AI_MEMORY_SEARCH_TOP_K', {
            infer: true,
          }),
        },
      );

      const systemMessages = this.promptBuilder.buildSystemMessages(
        context,
        latestUserContent,
      );
      const history: AiChatMessage[] = [
        ...systemMessages,
        ...priorMessages.map((m) => ({
          role: m.role.toLowerCase() as AiChatMessage['role'],
          content: m.content,
        })),
      ];
      if (options?.mode === 'continue' && options.existingContent) {
        history.push({ role: 'assistant', content: options.existingContent });
        history.push({
          role: 'user',
          content:
            'Continue your previous response from exactly where it left off.',
        });
      }

      // Local-First Migration Phase 1 (BYOK) — resolves this workspace's
      // own credential (if any) for the chosen/default provider before
      // resolving to a fallback; see AiProviderRegistryService.
      const { provider, credential } = await this.providerRegistry.resolveProvider(
        conversation.workspaceId,
        conversation.provider,
      );
      const model = conversation.model ?? provider.getDefaultModel(credential);
      const maxTokens = this.configService.get('AI_CHAT_STREAM_MAX_TOKENS', {
        infer: true,
      });

      // Module 15 — AI cost control (task #340). Throws AI_BUDGET_EXCEEDED
      // (caught by this method's own outer try/catch below, same path as
      // every other provider error — see formatProviderError) when this
      // workspace is over an AiBudgetPolicy with hardStop set. A
      // warning-only breach (hardStop unset) doesn't fail the request —
      // if a cheaper model is configured for the same provider, use it
      // for this turn instead; this is the "model fallback" half of task
      // #340. Falls back to the originally-resolved model whenever no
      // cheaper alternative is configured, which is always true on a
      // Community Edition deployment with no AiBudgetPolicy/AiModelPricing
      // rows at all (check() returns allowed:true, warning:false, no-op).
      const budgetCheck = await this.budgetEnforcer.check(conversation.workspaceId, userId, provider.name, model);
      const effectiveModel =
        budgetCheck.warning && budgetCheck.fallbackSuggested?.provider === provider.name
          ? budgetCheck.fallbackSuggested.model
          : model;
      if (effectiveModel !== model) {
        this.logger.warn(
          `AI budget warning for workspace ${conversation.workspaceId}: using cheaper model ${effectiveModel} instead of ${model} for this turn.`,
        );
      }

      let finalContent =
        options?.mode === 'continue' ? (options.existingContent ?? '') : '';
      let promptTokens: number | undefined;
      let completionTokens: number | undefined;
      let toolCallCount = 0;

      for (;;) {
        let buffer = '';
        let emittedLength = 0;
        let toolCallDetected = false;

        for await (const chunk of provider.streamChatCompletion(
          {
            model: effectiveModel,
            messages: history,
            maxTokens,
            signal: controller.signal,
          },
          credential,
        )) {
          if (chunk.delta) buffer += chunk.delta;
          if (chunk.promptTokens !== undefined)
            promptTokens = chunk.promptTokens;
          if (chunk.completionTokens !== undefined)
            completionTokens = chunk.completionTokens;

          if (!mightContainToolCall(buffer)) {
            const newText = buffer.slice(emittedLength);
            if (newText) {
              finalContent += newText;
              subject.next({ type: 'delta', content: newText });
              emittedLength = buffer.length;
            }
          } else {
            const toolCall = findToolCall(buffer);
            if (toolCall) {
              toolCallDetected = true;
              await this.handleToolCall(
                conversation,
                assistantMessageId,
                userId,
                toolCall,
                history,
                subject,
              );
              toolCallCount += 1;
              break;
            }
            // Otherwise: a '<' appeared but no complete tag yet — hold off
            // emitting until we know whether it's a real tool call or just
            // literal text (e.g. inside a code block).
          }

          if (chunk.done) break;
        }

        if (toolCallDetected && toolCallCount < MAX_TOOL_CALLS_PER_TURN) {
          continue; // loop again: history now includes the tool result
        }
        if (toolCallDetected) {
          // Hit the per-turn tool-call budget — emit a plain note instead
          // of silently stopping.
          const notice =
            "\n\n_(reached this turn's tool-call limit — answering with what was found so far)_";
          finalContent += notice;
          subject.next({ type: 'delta', content: notice });
        } else if (buffer.length > emittedLength) {
          // Buffer held back some text that turned out not to be a real
          // tool call (e.g. a literal "<" in prose/code) — flush it now.
          const remainder = buffer.slice(emittedLength);
          finalContent += remainder;
          subject.next({ type: 'delta', content: remainder });
        }
        break;
      }

      const updated = await this.messagesRepository.update(assistantMessageId, {
        content: finalContent,
        status: 'COMPLETE',
        promptTokens,
        completionTokens,
      });
      // Module 15 — AI cost control (task #340). Fire-and-forget — this
      // service already catches and logs its own errors internally (see
      // its doc comment), so a metering failure can never surface as a
      // failed chat turn. Uses `effectiveModel` (what actually served the
      // request, possibly the cost-fallback model), not `model`, so the
      // usage ledger and budget counters reflect reality.
      void this.budgetEnforcer.recordUsage(
        conversation.workspaceId,
        userId,
        provider.name,
        effectiveModel,
        promptTokens ?? 0,
        completionTokens ?? 0,
      );
      const toolCalls =
        await this.toolCallLogsRepository.listForMessage(assistantMessageId);
      const messageDto = toAiMessageDto(updated, toolCalls);
      subject.next({ type: 'done', message: messageDto });
      this.streamHub.complete(assistantMessageId);

      // Conversation Memory: index the finished turn so future turns
      // (and cross-conversation search) can retrieve it.
      void this.memoryService
        .indexContent({
          workspaceId: conversation.workspaceId,
          projectId: conversation.projectId,
          sourceType: 'CONVERSATION_MESSAGE',
          sourceId: assistantMessageId,
          content: `User: ${latestUserContent}\n\nAssistant: ${finalContent}`,
        })
        .catch((error: unknown) =>
          this.logger.warn(
            `Failed to index conversation memory: ${String(error)}`,
          ),
        );
    } catch (error) {
      const cancelled = controller.signal.aborted;
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `AI generation failed for message ${assistantMessageId}: ${message}`,
      );

      await this.messagesRepository
        .update(assistantMessageId, {
          status: cancelled ? 'CANCELLED' : 'FAILED',
          errorMessage: cancelled ? null : formatProviderError(error),
        })
        .catch(() => undefined);

      subject.next(
        cancelled
          ? { type: 'cancelled' }
          : { type: 'error', message: formatProviderError(error) },
      );
      this.streamHub.complete(assistantMessageId);
    }
  }

  private async handleToolCall(
    conversation: { id: string; workspaceId: string; projectId: string },
    assistantMessageId: string,
    userId: string,
    toolCall: ParsedToolCall,
    history: AiChatMessage[],
    subject: Subject<AiChatStreamEvent>,
  ): Promise<void> {
    subject.next({
      type: 'tool_call',
      toolName: toolCall.name,
      input: toolCall.input,
    });

    const tool = this.toolRegistry.get(toolCall.name);
    const startedAt = Date.now();
    let output: Record<string, unknown> = {};
    let errorMessage: string | null = null;

    if (!tool) {
      errorMessage = `Unknown tool "${toolCall.name}"`;
      output = { error: errorMessage };
    } else {
      try {
        output = await tool.execute(toolCall.input, {
          workspaceId: conversation.workspaceId,
          projectId: conversation.projectId,
          userId,
        });
      } catch (error) {
        errorMessage =
          error instanceof Error ? error.message : 'Tool execution failed';
        output = { error: errorMessage };
      }
    }

    await this.toolCallLogsRepository.create({
      conversationId: conversation.id,
      messageId: assistantMessageId,
      toolName: toolCall.name,
      input: toolCall.input,
      output,
      errorMessage,
      durationMs: Date.now() - startedAt,
    });

    subject.next({ type: 'tool_result', toolName: toolCall.name, output });

    history.push({ role: 'assistant', content: toolCall.raw });
    history.push({
      role: 'user',
      content: this.injectionGuard.wrapAsData(
        `tool result: ${toolCall.name}`,
        JSON.stringify(output),
      ),
    });
  }
}

function formatProviderError(error: unknown): string {
  if (error instanceof AiPrivacyModeViolationError) return error.message;
  if (error instanceof AiProviderNotConfiguredError) return error.message;
  if (error instanceof AiProviderRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred while generating a response.';
}
