import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BUILTIN_AGENTS } from '@pentesthub/agent-sdk';
import { BUILTIN_AGENT_SLUGS, type AgentSdkDefinitionDto, type AgentSdkManifest } from '@pentesthub/shared';
import { AgentSdkRepository, type AgentSdkDefinitionRow } from './agent-sdk.repository.js';

function toDto(row: AgentSdkDefinitionRow): AgentSdkDefinitionDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    pluginId: row.pluginId,
    slug: row.slug,
    name: row.name,
    description: row.description,
    kind: row.kind,
    status: row.status,
    manifest: row.manifestJson,
    permissions: row.permissions,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/// Module 13 — AI Agent SDK registry (task #281) + the eleven built-in
/// agents' server-side registration (task #282). On boot, seeds one
/// global (`workspaceId: null`) `AgentSdkDefinition` row per
/// `BUILTIN_AGENT_SLUGS` entry if it doesn't already exist — idempotent
/// (checked by slug, not re-inserted on every restart) so every
/// workspace sees the same eleven agents with zero setup, matching
/// `agent-sdk.ts`'s doc comment ("give every workspace a useful
/// starting roster").
@Injectable()
export class AgentSdkRegistryService implements OnModuleInit {
  private readonly logger = new Logger(AgentSdkRegistryService.name);

  constructor(private readonly repository: AgentSdkRepository) {}

  async onModuleInit(): Promise<void> {
    for (const slug of BUILTIN_AGENT_SLUGS) {
      const existing = await this.repository.findDefinitionBySlug(null, slug);
      if (existing) continue;
      const agent = BUILTIN_AGENTS[slug];
      const manifest: AgentSdkManifest = {
        entryPoint: `@pentesthub/agent-sdk/builtin#${slug}`,
        requestedTools: ['ask_ai'],
        requestedResourcePrefixes: ['*'],
      };
      await this.repository.createDefinition({
        workspaceId: null,
        slug,
        name: agent.displayName,
        description: agent.description,
        kind: 'BUILTIN',
        manifest,
        permissions: ['mcp:tools:call', 'mcp:resources:read'],
        createdBy: null,
      });
      this.logger.log(`Seeded built-in agent "${slug}".`);
    }
  }

  async list(workspaceId: string): Promise<AgentSdkDefinitionDto[]> {
    const rows = await this.repository.listDefinitions(workspaceId);
    return rows.map(toDto);
  }

  async getById(id: string): Promise<AgentSdkDefinitionDto | null> {
    const row = await this.repository.findDefinitionById(id);
    return row ? toDto(row) : null;
  }

  async register(
    workspaceId: string,
    userId: string,
    data: { slug: string; name: string; description: string; manifest: AgentSdkManifest; sourceCode?: string; permissions: string[] },
  ): Promise<AgentSdkDefinitionDto> {
    const row = await this.repository.createDefinition({
      workspaceId,
      slug: data.slug,
      name: data.name,
      description: data.description,
      kind: 'CUSTOM',
      manifest: data.manifest,
      sourceCode: data.sourceCode ?? null,
      permissions: data.permissions,
      createdBy: userId,
    });
    return toDto(row);
  }
}
