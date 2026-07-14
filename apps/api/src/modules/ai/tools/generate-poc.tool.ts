import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AiProviderRegistryService } from '../providers/ai-provider-registry.service.js';
import { collectStreamedCompletion } from '../providers/collect-stream.util.js';
import { AiPromptBuilderService } from '../prompts/ai-prompt-builder.service.js';
import type { AiTool } from './ai-tool.interface.js';

@Injectable()
export class GeneratePocTool implements AiTool {
  readonly name = 'generate_poc' as const;
  readonly description =
    'Generate a minimal proof-of-concept for a described vulnerability. Input: { description: string, language?: string }.';

  constructor(
    private readonly providerRegistry: AiProviderRegistryService,
    private readonly promptBuilder: AiPromptBuilderService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async execute(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const description =
      typeof input.description === 'string' ? input.description : '';
    if (!description.trim()) return { error: 'description is required' };
    const language =
      typeof input.language === 'string' ? input.language : 'python';

    const provider = this.providerRegistry.resolveProvider();
    const text = await collectStreamedCompletion(provider, {
      model: provider.getDefaultModel(),
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
          content: `Write a minimal, focused proof-of-concept in ${language} demonstrating this vulnerability: ${description}`,
        },
      ],
    });

    return { poc: text, language };
  }
}
