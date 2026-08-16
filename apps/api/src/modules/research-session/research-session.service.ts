import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  CreateResearchSessionRequestDto,
  LinkResearchSessionEntityRequestDto,
  ResearchSessionDto,
  ResearchSessionLinkDto,
} from '@pentesthub/shared';
import { AppException } from '../../common/exceptions/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';

interface ResearchSessionRow {
  id: string;
  workspaceId: string;
  projectId: string | null;
  targetId: string | null;
  programId: string | null;
  name: string;
  description: string | null;
  status: string;
  createdBy: string;
  startedAt: Date | string;
  endedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface ResearchSessionLinkRow {
  id: string;
  sessionId: string;
  entityType: string;
  entityId: string;
  linkedAt: Date | string;
}

function toDto(row: ResearchSessionRow): ResearchSessionDto {
  return {
    id: row.id,
    projectId: row.projectId,
    targetId: row.targetId,
    programId: row.programId,
    name: row.name,
    description: row.description,
    status: row.status as ResearchSessionDto['status'],
    startedAt: new Date(row.startedAt).toISOString(),
    endedAt: row.endedAt ? new Date(row.endedAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

function toLinkDto(row: ResearchSessionLinkRow): ResearchSessionLinkDto {
  return {
    id: row.id,
    entityType: row.entityType as ResearchSessionLinkDto['entityType'],
    entityId: row.entityId,
    linkedAt: new Date(row.linkedAt).toISOString(),
  };
}

/// Module 16 — task #371. A `ResearchSession` groups Recon jobs, Vuln
/// scans, Findings, Notes, Evidence, ad-hoc Terminal commands, AI
/// conversations, and Reports produced during one research engagement via
/// `ResearchSessionLink` rows — pointers, never re-owning the linked data
/// (see schema.prisma's doc comment on the model). Uses the
/// `as unknown as {...}` Prisma-cast pattern established by
/// `SecurityApprovalService`, since these are brand-new models the
/// sandbox's stale `@prisma/client` doesn't have typed accessors for yet.
@Injectable()
export class ResearchSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    workspaceId: string,
    userId: string,
    dto: CreateResearchSessionRequestDto,
  ): Promise<ResearchSessionDto> {
    const row = (await (
      this.prisma as unknown as {
        researchSession: { create: (args: unknown) => Promise<ResearchSessionRow> };
      }
    ).researchSession.create({
      data: {
        workspaceId,
        projectId: dto.projectId ?? null,
        targetId: dto.targetId ?? null,
        programId: dto.programId ?? null,
        name: dto.name,
        description: dto.description ?? null,
        status: 'ACTIVE',
        createdBy: userId,
      },
    })) as ResearchSessionRow;

    return toDto(row);
  }

  async listForWorkspace(workspaceId: string): Promise<ResearchSessionDto[]> {
    const rows = await (
      this.prisma as unknown as {
        researchSession: {
          findMany: (args: unknown) => Promise<ResearchSessionRow[]>;
        };
      }
    ).researchSession.findMany({
      where: { workspaceId },
      orderBy: { startedAt: 'desc' },
      take: 200,
    });

    return rows.map(toDto);
  }

  async getForWorkspace(
    id: string,
    workspaceId: string,
  ): Promise<ResearchSessionDto> {
    const row = await (
      this.prisma as unknown as {
        researchSession: {
          findUnique: (args: unknown) => Promise<ResearchSessionRow | null>;
        };
      }
    ).researchSession.findUnique({ where: { id } });

    if (!row || row.workspaceId !== workspaceId) {
      throw new AppException(
        'RESEARCH_SESSION_NOT_FOUND',
        'Research session not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    return toDto(row);
  }

  async pause(id: string, workspaceId: string): Promise<ResearchSessionDto> {
    return this.setStatus(id, workspaceId, 'PAUSED');
  }

  async resume(id: string, workspaceId: string): Promise<ResearchSessionDto> {
    return this.setStatus(id, workspaceId, 'ACTIVE');
  }

  async complete(id: string, workspaceId: string): Promise<ResearchSessionDto> {
    await this.getForWorkspace(id, workspaceId);
    const row = await (
      this.prisma as unknown as {
        researchSession: {
          update: (args: unknown) => Promise<ResearchSessionRow>;
        };
      }
    ).researchSession.update({
      where: { id },
      data: { status: 'COMPLETED', endedAt: new Date() },
    });
    return toDto(row);
  }

  async archive(id: string, workspaceId: string): Promise<ResearchSessionDto> {
    return this.setStatus(id, workspaceId, 'ARCHIVED');
  }

  private async setStatus(
    id: string,
    workspaceId: string,
    status: string,
  ): Promise<ResearchSessionDto> {
    await this.getForWorkspace(id, workspaceId);
    const row = await (
      this.prisma as unknown as {
        researchSession: {
          update: (args: unknown) => Promise<ResearchSessionRow>;
        };
      }
    ).researchSession.update({
      where: { id },
      data: { status },
    });
    return toDto(row);
  }

  async link(
    id: string,
    workspaceId: string,
    dto: LinkResearchSessionEntityRequestDto,
  ): Promise<ResearchSessionLinkDto> {
    // Confirms the session exists in this workspace before creating a
    // link — otherwise a caller could probe for session ids in other
    // workspaces via the 404 vs 201 response.
    await this.getForWorkspace(id, workspaceId);

    const row = (await (
      this.prisma as unknown as {
        researchSessionLink: {
          upsert: (args: unknown) => Promise<ResearchSessionLinkRow>;
        };
      }
    ).researchSessionLink.upsert({
      where: {
        sessionId_entityType_entityId: {
          sessionId: id,
          entityType: dto.entityType,
          entityId: dto.entityId,
        },
      },
      create: {
        sessionId: id,
        entityType: dto.entityType,
        entityId: dto.entityId,
      },
      update: {},
    })) as ResearchSessionLinkRow;

    return toLinkDto(row);
  }

  async listLinks(
    id: string,
    workspaceId: string,
  ): Promise<ResearchSessionLinkDto[]> {
    await this.getForWorkspace(id, workspaceId);

    const rows = await (
      this.prisma as unknown as {
        researchSessionLink: {
          findMany: (args: unknown) => Promise<ResearchSessionLinkRow[]>;
        };
      }
    ).researchSessionLink.findMany({
      where: { sessionId: id },
      orderBy: { linkedAt: 'desc' },
    });

    return rows.map(toLinkDto);
  }
}
