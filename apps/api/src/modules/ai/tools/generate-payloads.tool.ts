import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AiProviderRegistryService } from '../providers/ai-provider-registry.service.js';
import { collectStreamedCompletion } from '../providers/collect-stream.util.js';
import { AiPromptBuilderService } from '../prompts/ai-prompt-builder.service.js';
import type { AiTool, AiToolContext } from './ai-tool.interface.js';

@Injectable()
export class GeneratePayloadsTool implements AiTool {
  readonly name = 'generate_payloads' as const;
  readonly description =
    'Suggest a short, high-signal set of test payloads for a vulnerability class (SQLi, XSS, SSTI, SSRF, etc.). Input: { vulnClass: string, context?: string }.';

  constructor(
    private readonly providerRegistry: AiProviderRegistryService,
    private readonly promptBuilder: AiPromptBuilderService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async execute(
    input: Record<string, unknown>,
    context: AiToolContext,
  ): Promise<Record<string, unknown>> {
    const vulnClass =
      typeof input.vulnClass === 'string' ? input.vulnClass : '';
    if (!vulnClass.trim()) return { error: 'vulnClass is required' };
    const extraContext = typeof input.context === 'string' ? input.context : '';

    const { provider, credential } = await this.providerRegistry.resolveProvider(
      context.workspaceId,
    );
    const text = await collectStreamedCompletion(
      provider,
      {
        model: provider.getDefaultModel(credential),
        maxTokens: this.configService.get('AI_CHAT_STREAM_MAX_TOKENS', {
          infer: true,
        }),
        messages: [
          {
            role: 'system',
            content: this.promptBuilder.buildModePrompt('coding'),
          },
          {
            role: 'user',
            content: `Suggest a short set of high-signal test payloads for ${vulnClass}.${extraContext ? ` Context: ${extraContext}` : ''}`,
          },
        ],
      },
      credential,
    );

    return { payloads: text, vulnClass };
  }
}
