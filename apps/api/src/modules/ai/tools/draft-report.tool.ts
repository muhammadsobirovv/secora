import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AiProviderRegistryService } from '../providers/ai-provider-registry.service.js';
import { collectStreamedCompletion } from '../providers/collect-stream.util.js';
import { AiPromptBuilderService } from '../prompts/ai-prompt-builder.service.js';
import type { AiTool } from './ai-tool.interface.js';

@Injectable()
export class DraftReportTool implements AiTool {
  readonly name = 'draft_report' as const;
  readonly description =
    'Draft a bug bounty / pentest report or executive summary for the given finding(s) or topic. Input: { topic: string, style?: "full_report" | "executive_summary" }.';

  constructor(
    private readonly providerRegistry: AiProviderRegistryService,
    private readonly promptBuilder: AiPromptBuilderService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async execute(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const topic = typeof input.topic === 'string' ? input.topic : '';
    if (!topic.trim()) return { error: 'topic is required' };
    const style =
      input.style === 'executive_summary' ? 'executive_summary' : 'full_report';

    const provider = this.providerRegistry.resolveProvider();
    const text = await collectStreamedCompletion(provider, {
      model: provider.getDefaultModel(),
      maxTokens: this.configService.get('AI_CHAT_STREAM_MAX_TOKENS', {
        infer: true,
      }),
      messages: [
        {
          role: 'system',
          content: this.promptBuilder.buildModePrompt('report'),
        },
        {
          role: 'user',
          content:
            style === 'executive_summary'
              ? `Write a concise executive summary for: ${topic}`
              : `Draft a full bug bounty style report for: ${topic}`,
        },
      ],
    });

    return { report: text, style };
  }
}
