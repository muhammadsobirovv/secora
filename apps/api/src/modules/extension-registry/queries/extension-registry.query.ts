import { HttpStatus } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { ExtensionDto, ListExtensionsQueryDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { ResearcherMemoryWorkspaceResolver } from '../../researcher-memory/researcher-memory-workspace.util.js';
import { toExtensionDto } from '../mappers/to-extension-dto.mapper.js';

export class ListExtensionsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly filters: ListExtensionsQueryDto,
  ) {}
}

@QueryHandler(ListExtensionsQuery)
export class ListExtensionsHandler implements IQueryHandler<ListExtensionsQuery, ExtensionDto[]> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceResolver: ResearcherMemoryWorkspaceResolver,
  ) {}

  async execute(query: ListExtensionsQuery): Promise<ExtensionDto[]> {
    const workspaceId = await this.workspaceResolver.resolve(query.userId);
    const rows = await this.prisma.extensionRegistration.findMany({
      where: {
        workspaceId,
        type: query.filters.type ?? undefined,
        enabled: query.filters.enabled ?? undefined,
      },
      orderBy: { registeredAt: 'desc' },
      // Performance audit hardening: matches the `take` cap convention
      // every other Module 16 list handler already uses (this one was the
      // one unbounded findMany found during the audit).
      take: 200,
    });
    return rows.map(toExtensionDto);
  }
}

export class GetExtensionQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly extensionId: string,
  ) {}
}

@QueryHandler(GetExtensionQuery)
export class GetExtensionHandler implements IQueryHandler<GetExtensionQuery, ExtensionDto> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceResolver: ResearcherMemoryWorkspaceResolver,
  ) {}

  async execute(query: GetExtensionQuery): Promise<ExtensionDto> {
    const workspaceId = await this.workspaceResolver.resolve(query.userId);
    const row = await this.prisma.extensionRegistration.findFirst({ where: { id: query.extensionId, workspaceId } });
    if (!row) {
      throw new AppException('EXTENSION_NOT_FOUND', 'Extension not found.', HttpStatus.NOT_FOUND);
    }
    return toExtensionDto(row);
  }
}
