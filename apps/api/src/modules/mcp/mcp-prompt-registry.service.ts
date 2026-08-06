import { Injectable } from '@nestjs/common';
import type { McpGetPromptRequestParams, McpGetPromptResult, McpListPromptsResult, McpPromptDescriptor } from '@pentesthub/shared';
import { MCP_PROMPT_NAME_PREFIX } from '@pentesthub/shared';
import { PrismaService } from '../../prisma/prisma.service.js';

interface PromptTemplateRow {
  id: string;
  name: string;
  description: string | null;
  promptText: string;
}

/// Surfaces the Prompt Registry (task #280, `PromptTemplate` — Module 11)
/// over MCP's `prompts/list`/`prompts/get`, so any MCP-compatible host's
/// prompt picker shows every workspace prompt without a PentestHub-
/// specific integration. Read-only and additive — never writes to
/// `prompt_templates`; creating/editing prompts stays on the existing
/// `/ai/prompt-templates` REST surface (Module 11) and its new
/// versioning endpoints (task #280).
@Injectable()
export class McpPromptRegistryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string): Promise<McpListPromptsResult> {
    const rows = await this.prisma.$queryRaw<PromptTemplateRow[]>`
      SELECT "id", "name", "description", "promptText" FROM "prompt_templates"
      WHERE "workspaceId" = ${workspaceId}
      ORDER BY "name" ASC LIMIT 200`;
    const prompts: McpPromptDescriptor[] = rows.map((row) => ({
      name: `${MCP_PROMPT_NAME_PREFIX}${row.name}`,
      description: row.description ?? undefined,
      arguments: this.extractPlaceholders(row.promptText).map((name) => ({ name, required: true })),
    }));
    return { prompts, nextCursor: null };
  }

  async get(params: McpGetPromptRequestParams, workspaceId: string): Promise<McpGetPromptResult> {
    const rawName = params.name.startsWith(MCP_PROMPT_NAME_PREFIX)
      ? params.name.slice(MCP_PROMPT_NAME_PREFIX.length)
      : params.name;
    const rows = await this.prisma.$queryRaw<PromptTemplateRow[]>`
      SELECT "id", "name", "description", "promptText" FROM "prompt_templates"
      WHERE "workspaceId" = ${workspaceId} AND "name" = ${rawName}
      LIMIT 1`;
    const row = rows[0];
    if (!row) {
      return { description: undefined, messages: [] };
    }
    let text = row.promptText;
    for (const [key, value] of Object.entries(params.arguments ?? {})) {
      text = text.replaceAll(`{{${key}}}`, value);
    }
    return {
      description: row.description ?? undefined,
      messages: [{ role: 'user', content: { type: 'text', text } }],
    };
  }

  private extractPlaceholders(promptText: string): string[] {
    const matches = promptText.matchAll(/\{\{(\w+)\}\}/g);
    return [...new Set([...matches].map((m) => m[1]))];
  }
}
