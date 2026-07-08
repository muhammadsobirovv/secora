import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  CreateProjectInput,
  ListProjectsFilter,
  ProjectsRepository,
  ProjectWithTags,
  UpdateProjectInput,
} from '../../../domain/repositories/projects.repository.interface.js';
import type { Project } from '../../../../../prisma-types.js';

const WITH_TAGS = { tags: { include: { tag: true } } } as const;

function flattenTags(
  project: Project & { tags: { tag: unknown }[] },
): ProjectWithTags {
  const { tags, ...rest } = project;
  return { ...rest, tags: tags.map((t) => t.tag) } as ProjectWithTags;
}

@Injectable()
export class PrismaProjectsRepository implements ProjectsRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  create(input: CreateProjectInput): Promise<Project> {
    return this.txHost.tx.project.create({ data: input });
  }

  async findById(id: string): Promise<ProjectWithTags | null> {
    const project = await this.txHost.tx.project.findFirst({
      where: { id, deletedAt: null },
      include: WITH_TAGS,
    });
    return project ? flattenTags(project) : null;
  }

  async findByIdForWorkspace(
    id: string,
    workspaceId: string,
  ): Promise<ProjectWithTags | null> {
    const project = await this.txHost.tx.project.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: WITH_TAGS,
    });
    return project ? flattenTags(project) : null;
  }

  findByIdIncludingDeleted(id: string): Promise<Project | null> {
    return this.txHost.tx.project.findUnique({ where: { id } });
  }

  update(id: string, data: UpdateProjectInput): Promise<Project> {
    return this.txHost.tx.project.update({ where: { id }, data });
  }

  archive(id: string): Promise<Project> {
    return this.txHost.tx.project.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
  }

  restore(id: string): Promise<Project> {
    return this.txHost.tx.project.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  softDelete(id: string): Promise<Project> {
    return this.txHost.tx.project.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async list(filter: ListProjectsFilter): Promise<ProjectWithTags[]> {
    const projects = await this.txHost.tx.project.findMany({
      where: {
        workspaceId: filter.workspaceId,
        deletedAt: null,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.tagId ? { tags: { some: { tagId: filter.tagId } } } : {}),
        ...(filter.favoritedByUserId
          ? { favorites: { some: { userId: filter.favoritedByUserId } } }
          : {}),
      },
      include: WITH_TAGS,
      orderBy: { createdAt: 'desc' },
    });
    return projects.map(flattenTags);
  }
}
