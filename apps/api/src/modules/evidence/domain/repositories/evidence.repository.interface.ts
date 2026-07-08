import type { Evidence, EvidenceType } from '../../../../prisma-types.js';

export interface CreateEvidenceInput {
  projectId: string;
  targetId?: string | null;
  type: EvidenceType;
  title: string;
  description?: string;
  textContent?: string;
  createdBy: string;
}

export interface UpdateEvidenceInput {
  title?: string;
  description?: string;
  textContent?: string;
  checksum?: string;
}

export interface EvidenceRepository {
  create(input: CreateEvidenceInput): Promise<Evidence>;
  findById(id: string): Promise<Evidence | null>;
  update(id: string, data: UpdateEvidenceInput): Promise<Evidence>;
  softDelete(id: string): Promise<Evidence>;
  list(projectId: string, targetId?: string): Promise<Evidence[]>;
}

export const EVIDENCE_REPOSITORY = Symbol('EVIDENCE_REPOSITORY');
