import { Injectable } from '@nestjs/common';
import type { McpResourceContent, McpResourceDescriptor } from '@pentesthub/shared';
import { buildMcpResourceUri, parseMcpResourceUri, type McpResourceType } from '@pentesthub/shared';
import { Prisma } from '../../prisma-types.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const RESOURCE_TYPE_LABELS: Record<McpResourceType, string> = {
  projects: 'Projects',
  targets: 'Targets',
  findings: 'Findings',
  evidence: 'Evidence',
  reports: 'Bug Reports',
  notes: 'Notes',
  'knowledge-base': 'Knowledge Base',
  'recon-results': 'Recon Results',
  'scanner-results': 'Scanner Results',
  activity: 'Activity Timeline',
  'workspace-settings': 'Workspace Settings',
  'ai-memory': 'AI Memory',
  'rag-documents': 'RAG Documents',
};

/// MCP Resources (task #278). Every resource type is a **read-only**
/// projection over a table another module already owns — Projects/
/// Targets/Notes/Evidence (Module 2), Findings/Reports/Knowledge Base
/// (Module 6/9), Recon/Scanner Results (Module 3/4), Activity (Module 2),
/// Workspace Settings (Module 2), AI Memory + RAG Documents (Module 5/11,
/// both the same `ai_memory_chunks` store — see that table's Prisma doc
/// comment for why there's only one). Deliberately queries the database
/// directly with raw SQL rather than injecting each owning module's
/// internal repository: those repositories return their module's own
/// rich domain shape (with authorization/soft-delete/business-rule
/// concerns baked in for *that module's* callers), whereas every MCP
/// resource needs the same flat "rows for this workspace, newest first"
/// shape regardless of source table — a thin, uniform read layer here
/// avoids importing eleven other modules' internals into one service.
/// Workspace scoping is enforced in every query below; the caller
/// (`McpRpcDispatcherService`) never lets a session read a URI whose
/// `workspaceId` differs from the session's own.
@Injectable()
export class McpResourceRegistryService {
  constructor(private readonly prisma: PrismaService) {}

  listResourceTypes(workspaceId: string): McpResourceDescriptor[] {
    return (Object.keys(RESOURCE_TYPE_LABELS) as McpResourceType[]).map((type) => ({
      uri: buildMcpResourceUri(workspaceId, type),
      name: RESOURCE_TYPE_LABELS[type],
      description: `${RESOURCE_TYPE_LABELS[type]} in this workspace, exposed as an MCP resource collection.`,
      mimeType: 'application/json',
    }));
  }

  async readResource(uri: string): Promise<McpResourceContent[] | null> {
    const parsed = parseMcpResourceUri(uri);
    if (!parsed) return null;
    const rows = await this.queryRows(parsed.workspaceId, parsed.type, parsed.id);
    return [{ uri, mimeType: 'application/json', text: JSON.stringify(rows, null, 2) }];
  }

  private async queryRows(workspaceId: string, type: McpResourceType, id: string | null): Promise<unknown> {
    const limit = id ? 1 : 50;
    const idFilter = id ? Prisma.sql`AND "id" = ${id}` : Prisma.empty;

    switch (type) {
      case 'projects':
        return this.prisma.$queryRaw`
          SELECT * FROM "projects"
          WHERE "workspaceId" = ${workspaceId} AND "deletedAt" IS NULL ${idFilter}
          ORDER BY "createdAt" DESC LIMIT ${limit}`;
      case 'targets':
        return this.prisma.$queryRaw`
          SELECT t.* FROM "targets" t JOIN "projects" p ON t."projectId" = p."id"
          WHERE p."workspaceId" = ${workspaceId} AND t."deletedAt" IS NULL
            ${id ? Prisma.sql`AND t."id" = ${id}` : Prisma.empty}
          ORDER BY t."createdAt" DESC LIMIT ${limit}`;
      case 'notes':
        return this.prisma.$queryRaw`
          SELECT n.* FROM "notes" n JOIN "projects" p ON n."projectId" = p."id"
          WHERE p."workspaceId" = ${workspaceId} AND n."deletedAt" IS NULL
            ${id ? Prisma.sql`AND n."id" = ${id}` : Prisma.empty}
          ORDER BY n."createdAt" DESC LIMIT ${limit}`;
      case 'evidence':
        return this.prisma.$queryRaw`
          SELECT e.* FROM "evidence" e JOIN "projects" p ON e."projectId" = p."id"
          WHERE p."workspaceId" = ${workspaceId} AND e."deletedAt" IS NULL
            ${id ? Prisma.sql`AND e."id" = ${id}` : Prisma.empty}
          ORDER BY e."createdAt" DESC LIMIT ${limit}`;
      case 'findings':
        return this.prisma.$queryRaw`
          SELECT * FROM "bugbounty_findings"
          WHERE "workspaceId" = ${workspaceId} ${idFilter}
          ORDER BY "createdAt" DESC LIMIT ${limit}`;
      case 'reports':
        return this.prisma.$queryRaw`
          SELECT * FROM "bugbounty_reports"
          WHERE "workspaceId" = ${workspaceId} ${idFilter}
          ORDER BY "createdAt" DESC LIMIT ${limit}`;
      case 'knowledge-base':
        return this.prisma.$queryRaw`
          SELECT * FROM "knowledge_base_notes"
          WHERE "workspaceId" = ${workspaceId} AND "deletedAt" IS NULL ${idFilter}
          ORDER BY "createdAt" DESC LIMIT ${limit}`;
      case 'recon-results':
        return this.prisma.$queryRaw`
          SELECT * FROM "recon_findings"
          WHERE "workspaceId" = ${workspaceId} ${idFilter}
          ORDER BY "firstSeenAt" DESC LIMIT ${limit}`;
      case 'scanner-results':
        return this.prisma.$queryRaw`
          SELECT * FROM "vuln_findings"
          WHERE "workspaceId" = ${workspaceId} ${idFilter}
          ORDER BY "createdAt" DESC LIMIT ${limit}`;
      case 'activity':
        return this.prisma.$queryRaw`
          SELECT * FROM "activity_events"
          WHERE "workspaceId" = ${workspaceId} ${idFilter}
          ORDER BY "createdAt" DESC LIMIT ${limit}`;
      case 'workspace-settings':
        return this.prisma.$queryRaw`
          SELECT * FROM "workspace_settings" WHERE "workspaceId" = ${workspaceId}`;
      case 'ai-memory':
      case 'rag-documents':
        // Same underlying store (ai_memory_chunks) — see this class's
        // doc comment. `embedding` (an Unsupported pgvector column) is
        // never selected here; MCP exposes the chunked text/metadata,
        // never the raw vector.
        return this.prisma.$queryRaw`
          SELECT "id", "workspaceId", "projectId", "sourceType", "sourceId", "chunkIndex", "content", "metadata", "expiresAt", "createdAt"
          FROM "ai_memory_chunks"
          WHERE "workspaceId" = ${workspaceId} AND ("expiresAt" IS NULL OR "expiresAt" > now()) ${idFilter}
          ORDER BY "createdAt" DESC LIMIT ${limit}`;
      default:
        return [];
    }
  }
}
