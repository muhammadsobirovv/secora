import type {
  VulnScanTemplate,
  VulnScanner,
} from '../../../../prisma-types.js';

export interface CreateVulnScanTemplateInput {
  workspaceId: string;
  name: string;
  description: string | null;
  scanners: VulnScanner[];
  config: Record<string, unknown> | null;
  createdBy: string;
}

export interface VulnScanTemplatesRepository {
  create(input: CreateVulnScanTemplateInput): Promise<VulnScanTemplate>;
  findById(id: string): Promise<VulnScanTemplate | null>;
  findByIdForWorkspace(
    id: string,
    workspaceId: string,
  ): Promise<VulnScanTemplate | null>;
  list(workspaceId: string): Promise<VulnScanTemplate[]>;
  /// isBuiltIn templates are never deleted (returns null instead of
  /// deleting) — the command handler turns that into a 4xx.
  deleteIfNotBuiltIn(
    id: string,
    workspaceId: string,
  ): Promise<VulnScanTemplate | null>;
}

export const VULN_SCAN_TEMPLATES_REPOSITORY = Symbol(
  'VULN_SCAN_TEMPLATES_REPOSITORY',
);
