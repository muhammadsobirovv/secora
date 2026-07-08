import type {
  ProjectMember,
  ProjectMemberRole,
} from '../../../../prisma-types.js';

export interface ProjectMembersRepository {
  add(
    projectId: string,
    userId: string,
    role: ProjectMemberRole,
  ): Promise<ProjectMember>;
  remove(projectId: string, userId: string): Promise<void>;
  findByProjectAndUser(
    projectId: string,
    userId: string,
  ): Promise<ProjectMember | null>;
  list(projectId: string): Promise<ProjectMember[]>;
}

export const PROJECT_MEMBERS_REPOSITORY = Symbol('PROJECT_MEMBERS_REPOSITORY');
