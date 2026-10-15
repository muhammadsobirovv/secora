import {
  BadRequestException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { AiBudgetEnforcerService } from '../../billing/ai-cost/ai-budget-enforcer.service.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../ai-authorization.util.js';
import { FreeTierGateService } from '../chat/free-tier-gate.service.js';
import { AI_PLATFORM_HELPER_PROMPT } from '../prompts/system.prompts.js';
import type { AiChatMessage } from '../providers/ai-provider.interface.js';
import { AiProviderRegistryService } from '../providers/ai-provider-registry.service.js';

export interface AssistantTurnMessage {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_HISTORY_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 4000;

/// The floating "Secora AI" helper: a stateless, project-less chat that
/// explains the platform. Nothing is stored — the browser sends the recent
/// turns each time. It still goes through the same gates as the project chat:
/// the hosted free tier (daily cap, server Gemini key + Gemma) for free users
/// without their own key, or the user's own BYOK / the platform provider
/// otherwise, plus the AI budget check and usage recording.
@Injectable()
export class AiAssistantService {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    private readonly providerRegistry: AiProviderRegistryService,
    private readonly freeTierGate: FreeTierGateService,
    private readonly budgetEnforcer: AiBudgetEnforcerService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async *stream(
    userId: string,
    messages: AssistantTurnMessage[],
    signal?: AbortSignal,
  ): AsyncGenerator<string> {
    const workspace =
      await this.workspacesRepository.findPersonalWorkspaceForUser(userId);
    if (!workspace) {
      throw new AppException(
        'WORKSPACE_NOT_FOUND',
        'Workspace not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const recent = messages
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m) => ({
        role: m.role,
        content: m.content.slice(0, MAX_MESSAGE_CHARS),
      }))
      .filter((m) => m.content.trim().length > 0);
    if (recent.length === 0 || recent[recent.length - 1]?.role !== 'user') {
      throw new BadRequestException('The last message must be a user message.');
    }

    const freeTier = await this.freeTierGate.evaluate(workspace.id, userId);
    const history: AiChatMessage[] = [
      { role: 'system', content: AI_PLATFORM_HELPER_PROMPT },
      ...recent,
    ];
    const bounded = freeTier
      ? this.freeTierGate.trimForFreeTier(history)
      : history;

    const { provider, credential } = freeTier
      ? {
          provider: this.providerRegistry.get('GEMINI'),
          credential: undefined,
        }
      : await this.providerRegistry.resolveProvider(workspace.id, undefined);
    const model = freeTier
      ? freeTier.model
      : provider.getDefaultModel(credential);

    await this.budgetEnforcer.check(workspace.id, userId, provider.name, model);

    let promptTokens: number | undefined;
    let completionTokens: number | undefined;

    for await (const chunk of provider.streamChatCompletion(
      {
        model,
        messages: bounded,
        maxTokens: Math.min(
          1024,
          this.configService.get('AI_CHAT_STREAM_MAX_TOKENS', { infer: true }),
        ),
        signal,
      },
      credential,
    )) {
      if (chunk.promptTokens !== undefined) promptTokens = chunk.promptTokens;
      if (chunk.completionTokens !== undefined)
        completionTokens = chunk.completionTokens;
      if (chunk.delta) yield chunk.delta;
      if (chunk.done) break;
    }

    void this.budgetEnforcer.recordUsage(
      workspace.id,
      userId,
      provider.name,
      model,
      promptTokens ?? 0,
      completionTokens ?? 0,
    );
  }
}
