import { randomUUID } from 'node:crypto';
import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type {
  AiProviderName,
  CreatePromptTemplateVersionRequestDto,
  ImportPromptTemplatesRequestDto,
  PromptTemplateDto,
  PromptTemplateVersionDto,
  PromptTestRunDto,
  RatePromptTestRunRequestDto,
  RunPromptTestRequestDto,
} from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
  resolvePromptTemplateForCaller,
} from '../ai-authorization.util.js';
import {
  PROMPT_TEMPLATE_REPOSITORY,
  type PromptTemplateRepository,
} from '../domain/repositories/prompt-template.repository.interface.js';
import { toPromptTemplateDto } from '../mappers/to-prompt-template-dto.mapper.js';
import { AiProviderRegistryService } from '../providers/ai-provider-registry.service.js';
import { collectStreamedCompletion } from '../providers/collect-stream.util.js';

/// Module 13 — Prompt Registry (task #280) additions on top of Module
/// 11's `PromptTemplate`. `prompt_template_versions`/`prompt_test_runs`
/// are new Module 13 tables (raw-SQL only, see their schema.prisma doc
/// comments) — this file's handlers are the only place that writes to
/// them, mirroring how `create-prompt-template.command.ts` etc. are the
/// only writers of `prompt_templates` itself.

// ---- Versioning ----

export class CreatePromptTemplateVersionCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly templateId: string,
    public readonly data: CreatePromptTemplateVersionRequestDto,
  ) {}
}

@CommandHandler(CreatePromptTemplateVersionCommand)
export class CreatePromptTemplateVersionHandler
  implements ICommandHandler<CreatePromptTemplateVersionCommand, PromptTemplateVersionDto>
{
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROMPT_TEMPLATE_REPOSITORY) private readonly promptTemplatesRepository: PromptTemplateRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(command: CreatePromptTemplateVersionCommand): Promise<PromptTemplateVersionDto> {
    const template = await resolvePromptTemplateForCaller(
      this.promptTemplatesRepository,
      this.workspacesRepository,
      command.userId,
      command.templateId,
    );

    // Prompt Validation (task #280): every `{{placeholder}}` the new text
    // declares must be listed in `variables` too, or a `prompts/get`
    // (MCP) / test run against this version would silently leak a
    // literal `{{x}}` into the rendered prompt instead of failing loudly
    // now, at save time.
    const declared = new Set(command.data.variables ?? []);
    const used = [...command.data.promptText.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    const undeclared = used.filter((name) => !declared.has(name));
    if (undeclared.length > 0) {
      throw new AppException(
        'PROMPT_VARIABLE_MISSING',
        `Prompt text references undeclared variable(s): ${undeclared.join(', ')}.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const rows = await this.prisma.$queryRaw<{ maxVersion: number | null }[]>`
      SELECT MAX("version") AS "maxVersion" FROM "prompt_template_versions" WHERE "promptTemplateId" = ${template.id}
    `;
    const nextVersion = (rows[0]?.maxVersion ?? 0) + 1;

    const inserted = await this.prisma.$queryRaw<
      { id: string; version: number; promptText: string; variablesJson: unknown; changelog: string | null; createdBy: string; createdAt: Date }[]
    >`
      INSERT INTO "prompt_template_versions" ("id", "promptTemplateId", "version", "promptText", "variablesJson", "changelog", "createdBy", "createdAt")
      VALUES (${randomUUID()}, ${template.id}, ${nextVersion}, ${command.data.promptText}, ${JSON.stringify(command.data.variables ?? [])}::jsonb, ${command.data.changelog ?? null}, ${command.userId}, now())
      RETURNING *
    `;

    // Saving a version also updates the template's *current* text, so
    // `PromptTemplate.promptText` (what `/ai/prompt-templates` and MCP's
    // `prompts/get` both read) always reflects the latest saved version.
    await this.promptTemplatesRepository.update(template.id, { promptText: command.data.promptText });

    const row = inserted[0];
    return {
      id: row.id,
      promptTemplateId: template.id,
      version: row.version,
      promptText: row.promptText,
      variables: (row.variablesJson as string[] | null) ?? null,
      changelog: row.changelog,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

// ---- Prompt Testing ----

export class RunPromptTestCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly templateId: string,
    public readonly data: RunPromptTestRequestDto,
  ) {}
}

@CommandHandler(RunPromptTestCommand)
export class RunPromptTestHandler implements ICommandHandler<RunPromptTestCommand, PromptTestRunDto> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROMPT_TEMPLATE_REPOSITORY) private readonly promptTemplatesRepository: PromptTemplateRepository,
    private readonly prisma: PrismaService,
    private readonly aiProviderRegistry: AiProviderRegistryService,
  ) {}

  async execute(command: RunPromptTestCommand): Promise<PromptTestRunDto> {
    const template = await resolvePromptTemplateForCaller(
      this.promptTemplatesRepository,
      this.workspacesRepository,
      command.userId,
      command.templateId,
    );

    let promptText = template.promptText;
    if (command.data.version) {
      const versionRows = await this.prisma.$queryRaw<{ promptText: string }[]>`
        SELECT "promptText" FROM "prompt_template_versions" WHERE "promptTemplateId" = ${template.id} AND "version" = ${command.data.version}
      `;
      if (!versionRows[0]) {
        throw new AppException('PROMPT_TEMPLATE_VERSION_NOT_FOUND', `Version ${command.data.version} not found.`, HttpStatus.NOT_FOUND);
      }
      promptText = versionRows[0].promptText;
    }

    let rendered = promptText;
    for (const [key, value] of Object.entries(command.data.inputVariables ?? {})) {
      rendered = rendered.replaceAll(`{{${key}}}`, value);
    }
    const stillUnresolved = [...rendered.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    if (stillUnresolved.length > 0) {
      throw new AppException(
        'PROMPT_VARIABLE_MISSING',
        `Missing input value(s) for: ${[...new Set(stillUnresolved)].join(', ')}.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const startedAt = Date.now();
    let outputText: string | null = null;
    let status: 'SUCCEEDED' | 'FAILED' = 'SUCCEEDED';
    let errorMessage: string | null = null;
    let provider = command.data.provider ?? null;
    let model = command.data.model ?? null;
    try {
      const resolved = await this.aiProviderRegistry.resolveProvider(
        template.workspaceId,
        command.data.provider as AiProviderName | undefined,
      );
      provider = resolved.provider.name;
      model = command.data.model ?? resolved.provider.getDefaultModel(resolved.credential);
      outputText = await collectStreamedCompletion(
        resolved.provider,
        { model, messages: [{ role: 'user', content: rendered }], maxTokens: 1024 },
        resolved.credential,
      );
    } catch (error) {
      status = 'FAILED';
      errorMessage = error instanceof Error ? error.message : String(error);
    }
    const durationMs = Date.now() - startedAt;

    const inserted = await this.prisma.$queryRaw<
      {
        id: string;
        promptTemplateVersion: number | null;
        inputVariablesJson: unknown;
        renderedPrompt: string;
        outputText: string | null;
        provider: string | null;
        model: string | null;
        status: string;
        errorMessage: string | null;
        durationMs: number | null;
        ratingScore: number | null;
        notes: string | null;
        createdBy: string;
        createdAt: Date;
      }[]
    >`
      INSERT INTO "prompt_test_runs"
        ("id", "promptTemplateId", "promptTemplateVersion", "workspaceId", "inputVariablesJson", "renderedPrompt", "outputText", "provider", "model", "status", "errorMessage", "durationMs", "createdBy", "createdAt")
      VALUES
        (${randomUUID()}, ${template.id}, ${command.data.version ?? null}, ${template.workspaceId}, ${JSON.stringify(command.data.inputVariables ?? {})}::jsonb, ${rendered}, ${outputText}, ${provider}, ${model}, ${status}::"PromptTestRunStatus", ${errorMessage}, ${durationMs}, ${command.userId}, now())
      RETURNING *
    `;
    const row = inserted[0];
    return {
      id: row.id,
      promptTemplateId: template.id,
      promptTemplateVersion: row.promptTemplateVersion,
      inputVariables: (row.inputVariablesJson as Record<string, string> | null) ?? null,
      renderedPrompt: row.renderedPrompt,
      outputText: row.outputText,
      provider: row.provider,
      model: row.model,
      status: row.status as PromptTestRunDto['status'],
      errorMessage: row.errorMessage,
      durationMs: row.durationMs,
      ratingScore: row.ratingScore,
      notes: row.notes,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

// ---- Prompt History (rating a past test run) ----

export class RatePromptTestRunCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly templateId: string,
    public readonly runId: string,
    public readonly data: RatePromptTestRunRequestDto,
  ) {}
}

@CommandHandler(RatePromptTestRunCommand)
export class RatePromptTestRunHandler implements ICommandHandler<RatePromptTestRunCommand, { rated: true }> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROMPT_TEMPLATE_REPOSITORY) private readonly promptTemplatesRepository: PromptTemplateRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(command: RatePromptTestRunCommand): Promise<{ rated: true }> {
    await resolvePromptTemplateForCaller(this.promptTemplatesRepository, this.workspacesRepository, command.userId, command.templateId);
    await this.prisma.$executeRaw`
      UPDATE "prompt_test_runs" SET "ratingScore" = ${command.data.ratingScore}, "notes" = ${command.data.notes ?? null}
      WHERE "id" = ${command.runId} AND "promptTemplateId" = ${command.templateId}
    `;
    return { rated: true };
  }
}

// ---- Import ----

export class ImportPromptTemplatesCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: ImportPromptTemplatesRequestDto,
  ) {}
}

@CommandHandler(ImportPromptTemplatesCommand)
export class ImportPromptTemplatesHandler implements ICommandHandler<ImportPromptTemplatesCommand, PromptTemplateDto[]> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROMPT_TEMPLATE_REPOSITORY) private readonly promptTemplatesRepository: PromptTemplateRepository,
  ) {}

  async execute(command: ImportPromptTemplatesCommand): Promise<PromptTemplateDto[]> {
    const workspace = await this.workspacesRepository.findPersonalWorkspaceForUser(command.userId);
    if (!workspace) {
      throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
    }
    const created: PromptTemplateDto[] = [];
    for (const item of command.data.templates) {
      const record = await this.promptTemplatesRepository.create({
        workspaceId: workspace.id,
        name: item.name,
        description: item.description ?? null,
        promptText: item.promptText,
        category: item.category ?? null,
        createdBy: command.userId,
      });
      created.push(toPromptTemplateDto(record));
    }
    return created;
  }
}
