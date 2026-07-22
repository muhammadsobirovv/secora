import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AiProviderName,
  ExplainPayloadRequestDto,
  PayloadLibraryEntryDto,
} from '@pentesthub/shared';
import { AI_PROVIDER_NAMES } from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  PAYLOAD_LIBRARY_REPOSITORY,
  type PayloadLibraryRepository,
} from '../domain/repositories/payload-library.repository.interface.js';
import { resolveWorkspaceForCaller } from '../authorization.util.js';
import { toPayloadLibraryEntryDto } from '../mappers/to-payload-library-entry-dto.mapper.js';
import { AiProviderRegistryService } from '../../ai/providers/ai-provider-registry.service.js';
import { collectStreamedCompletion } from '../../ai/providers/collect-stream.util.js';

export class ExplainPayloadCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly entryId: string,
    public readonly data: ExplainPayloadRequestDto,
  ) {}
}

function isValidProviderName(
  value: string | undefined,
): value is AiProviderName {
  return !!value && (AI_PROVIDER_NAMES as string[]).includes(value);
}

/// Unlike update/delete, explaining a payload is a read-augmenting AI
/// action rather than a content edit, so it's allowed on seed entries
/// (workspaceId null) too — every workspace can read seed entries (see
/// PayloadLibraryRepository.list's comment), and the resulting
/// aiExplanation becomes a shared, crowd-sourced enrichment of that seed
/// entry rather than a per-workspace copy. Custom entries still require
/// the caller's own workspace to own the entry.
@CommandHandler(ExplainPayloadCommand)
export class ExplainPayloadHandler implements ICommandHandler<
  ExplainPayloadCommand,
  PayloadLibraryEntryDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PAYLOAD_LIBRARY_REPOSITORY)
    private readonly payloadLibraryRepository: PayloadLibraryRepository,
    private readonly providerRegistry: AiProviderRegistryService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async execute(
    command: ExplainPayloadCommand,
  ): Promise<PayloadLibraryEntryDto> {
    const workspace = await resolveWorkspaceForCaller(
      this.workspacesRepository,
      command.userId,
    );

    const entry = await this.payloadLibraryRepository.findById(command.entryId);
    if (
      !entry ||
      (entry.workspaceId !== null && entry.workspaceId !== workspace.id)
    ) {
      throw new AppException(
        'PAYLOAD_LIBRARY_ENTRY_NOT_FOUND',
        'Payload library entry not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const preferred = isValidProviderName(command.data.provider)
      ? command.data.provider
      : null;
    const { provider, credential } = await this.providerRegistry.resolveProvider(
      workspace.id,
      preferred,
    );
    const model = command.data.model ?? provider.getDefaultModel(credential);

    const text = await collectStreamedCompletion(
      provider,
      {
        model,
        maxTokens: this.configService.get('AI_CHAT_STREAM_MAX_TOKENS', {
          infer: true,
        }),
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content:
              'You are a security research assistant explaining offensive payloads to a bug bounty hunter. Be concise, technical, and precise. Explain: what the payload does, why it triggers the vulnerability class it targets, and any preconditions or caveats for it to work.',
          },
          {
            role: 'user',
            content: `Category: ${entry.category}\nTitle: ${entry.title}\nDescription: ${entry.description}\nPayload:\n${entry.example}\n\nExplain this payload.`,
          },
        ],
      },
      credential,
    );

    const updated = await this.payloadLibraryRepository.update(
      command.entryId,
      {
        aiExplanation: text.trim(),
      },
    );
    return toPayloadLibraryEntryDto(updated);
  }
}
