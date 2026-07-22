import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AiProviderCredentialDto,
  AiProviderName,
} from '@pentesthub/shared';
import { AI_PROVIDER_NAMES } from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import {
  encryptCredential,
  previewCredential,
} from '../../../common/utils/credential-encryption.util.js';
import {
  AI_PROVIDER_CREDENTIALS_REPOSITORY,
  type AiProviderCredentialsRepository,
} from '../domain/repositories/ai-provider-credentials.repository.interface.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../ai-authorization.util.js';
import { toAiProviderCredentialDto } from '../mappers/to-ai-provider-credential-dto.mapper.js';
import { AppException } from '../../../common/exceptions/app.exception.js';

export interface UpsertAiProviderCredentialFields {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export class UpsertAiProviderCredentialCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly provider: string,
    public readonly fields: UpsertAiProviderCredentialFields,
  ) {}
}

function isValidProviderName(value: string): value is AiProviderName {
  return (AI_PROVIDER_NAMES as string[]).includes(value);
}

/// Merge-then-replace, not a partial PATCH: the repository's `upsert` sets
/// every column on every call (see PrismaAiProviderCredentialsRepository),
/// so this handler first reads the existing row and carries forward any
/// field the caller didn't include in this request — only an explicit ""
/// clears a field, matching UpsertAiProviderCredentialRequestDto's doc
/// comment in packages/shared/src/ai.ts.
@CommandHandler(UpsertAiProviderCredentialCommand)
export class UpsertAiProviderCredentialHandler implements ICommandHandler<
  UpsertAiProviderCredentialCommand,
  AiProviderCredentialDto
> {
  constructor(
    @Inject(AI_PROVIDER_CREDENTIALS_REPOSITORY)
    private readonly credentialsRepository: AiProviderCredentialsRepository,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async execute(
    command: UpsertAiProviderCredentialCommand,
  ): Promise<AiProviderCredentialDto> {
    if (!isValidProviderName(command.provider)) {
      throw new AppException(
        'INVALID_AI_PROVIDER',
        `Unknown AI provider "${command.provider}".`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const workspace =
      await this.workspacesRepository.findPersonalWorkspaceForUser(
        command.userId,
      );
    if (!workspace) {
      throw new AppException(
        'WORKSPACE_NOT_FOUND',
        'Workspace not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const existing = await this.credentialsRepository.findByWorkspaceAndProvider(
      workspace.id,
      command.provider,
    );

    let encryptedApiKey = existing?.encryptedApiKey ?? null;
    let keyPreview = existing?.keyPreview ?? null;
    if (command.fields.apiKey !== undefined) {
      if (command.fields.apiKey === '') {
        encryptedApiKey = null;
        keyPreview = null;
      } else {
        const encryptionKey = this.configService.get(
          'CREDENTIAL_ENCRYPTION_KEY',
          { infer: true },
        );
        encryptedApiKey = encryptCredential(
          command.fields.apiKey,
          encryptionKey,
        );
        keyPreview = previewCredential(command.fields.apiKey);
      }
    }

    const baseUrl =
      command.fields.baseUrl !== undefined
        ? command.fields.baseUrl || null
        : (existing?.baseUrl ?? null);
    const model =
      command.fields.model !== undefined
        ? command.fields.model || null
        : (existing?.model ?? null);

    const record = await this.credentialsRepository.upsert({
      workspaceId: workspace.id,
      provider: command.provider,
      encryptedApiKey,
      keyPreview,
      baseUrl,
      model,
    });

    return toAiProviderCredentialDto(record);
  }
}
