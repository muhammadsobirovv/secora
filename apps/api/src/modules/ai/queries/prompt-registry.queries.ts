import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { PromptTemplateExportDto, PromptTemplateVersionDto, PromptTestRunDto } from '@pentesthub/shared';
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

/// Module 13 — Prompt Registry read side (task #280), paired with
/// prompt-registry.commands.ts. Every handler here re-runs
/// resolvePromptTemplateForCaller first — same workspace-isolation
/// enumeration-safe-404 guarantee as the AI Chat Prompt Library's own
/// query handlers (see e.g. list-ai-conversations.query.ts).

export class ListPromptTemplateVersionsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly templateId: string,
  ) {}
}

@QueryHandler(ListPromptTemplateVersionsQuery)
export class ListPromptTemplateVersionsHandler
  implements IQueryHandler<ListPromptTemplateVersionsQuery, PromptTemplateVersionDto[]>
{
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROMPT_TEMPLATE_REPOSITORY) private readonly promptTemplatesRepository: PromptTemplateRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(query: ListPromptTemplateVersionsQuery): Promise<PromptTemplateVersionDto[]> {
    const template = await resolvePromptTemplateForCaller(
      this.promptTemplatesRepository,
      this.workspacesRepository,
      query.userId,
      query.templateId,
    );
    const rows = await this.prisma.$queryRaw<
      { id: string; version: number; promptText: string; variablesJson: unknown; changelog: string | null; createdBy: string; createdAt: Date }[]
    >`
      SELECT * FROM "prompt_template_versions" WHERE "promptTemplateId" = ${template.id} ORDER BY "version" DESC
    `;
    return rows.map((row) => ({
      id: row.id,
      promptTemplateId: template.id,
      version: row.version,
      promptText: row.promptText,
      variables: (row.variablesJson as string[] | null) ?? null,
      changelog: row.changelog,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}

export class ListPromptTestRunsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly templateId: string,
  ) {}
}

@QueryHandler(ListPromptTestRunsQuery)
export class ListPromptTestRunsHandler implements IQueryHandler<ListPromptTestRunsQuery, PromptTestRunDto[]> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROMPT_TEMPLATE_REPOSITORY) private readonly promptTemplatesRepository: PromptTemplateRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(query: ListPromptTestRunsQuery): Promise<PromptTestRunDto[]> {
    const template = await resolvePromptTemplateForCaller(
      this.promptTemplatesRepository,
      this.workspacesRepository,
      query.userId,
      query.templateId,
    );
    const rows = await this.prisma.$queryRaw<
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
      SELECT * FROM "prompt_test_runs" WHERE "promptTemplateId" = ${template.id} ORDER BY "createdAt" DESC LIMIT 50
    `;
    return rows.map((row) => ({
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
    }));
  }
}

/// Export (task #280): all of a workspace's templates, in the portable
/// `PromptTemplateExportDto` shape `ImportPromptTemplatesCommand` (and,
/// per that file's doc comment, a future marketplace Prompt Pack
/// builder) both consume.
export class ExportPromptTemplatesQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

@QueryHandler(ExportPromptTemplatesQuery)
export class ExportPromptTemplatesHandler implements IQueryHandler<ExportPromptTemplatesQuery, PromptTemplateExportDto[]> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROMPT_TEMPLATE_REPOSITORY) private readonly promptTemplatesRepository: PromptTemplateRepository,
  ) {}

  async execute(query: ExportPromptTemplatesQuery): Promise<PromptTemplateExportDto[]> {
    const workspace = await this.workspacesRepository.findPersonalWorkspaceForUser(query.userId);
    if (!workspace) return [];
    const templates = await this.promptTemplatesRepository.list({ workspaceId: workspace.id });
    return templates.map((template) => ({
      name: template.name,
      description: template.description,
      category: template.category,
      promptText: template.promptText,
      variables: [...new Set([...template.promptText.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))],
    }));
  }
}
