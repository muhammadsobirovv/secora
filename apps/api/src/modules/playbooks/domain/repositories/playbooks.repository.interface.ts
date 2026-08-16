import type { PlaybookGraph, PlaybookVariableDefinition } from '@pentesthub/shared';
import type { Playbook, PlaybookVersion } from '../../../../prisma-types.js';

export interface CreatePlaybookInput {
  workspaceId: string;
  name: string;
  description?: string | null;
  category: string;
  isBuiltIn?: boolean;
  createdBy: string;
}

export interface UpdatePlaybookInput {
  name?: string;
  description?: string | null;
  category?: string;
  status?: string;
  currentVersionId?: string | null;
  archivedAt?: Date | null;
}

export interface CreatePlaybookVersionInput {
  playbookId: string;
  version: number;
  graph: PlaybookGraph;
  variables: PlaybookVariableDefinition[];
  createdBy: string;
}

export interface PublishPlaybookVersionInput {
  publishedBy: string;
}

export interface ListPlaybooksFilter {
  workspaceId: string;
  status?: string;
  category?: string;
}

export interface PlaybooksRepository {
  create(input: CreatePlaybookInput): Promise<Playbook>;
  findById(id: string): Promise<Playbook | null>;
  findByIdForWorkspace(id: string, workspaceId: string): Promise<Playbook | null>;
  list(filter: ListPlaybooksFilter): Promise<Playbook[]>;
  update(id: string, input: UpdatePlaybookInput): Promise<Playbook>;

  createVersion(input: CreatePlaybookVersionInput): Promise<PlaybookVersion>;
  findVersionById(id: string): Promise<PlaybookVersion | null>;
  findLatestVersion(playbookId: string): Promise<PlaybookVersion | null>;
  publishVersion(id: string, input: PublishPlaybookVersionInput): Promise<PlaybookVersion>;
}

export const PLAYBOOKS_REPOSITORY = Symbol('PLAYBOOKS_REPOSITORY');
