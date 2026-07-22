import type {
  PayloadLibraryEntry,
  PayloadCategory,
} from '../../../../prisma-types.js';

export interface ListPayloadLibraryFilter {
  /// Payload library entries are visible workspace-wide plus the global
  /// seed set (workspaceId IS NULL) — the repository always ORs the two
  /// in, callers never request "seed only" or "custom only" directly.
  workspaceId: string;
  category?: PayloadCategory;
  search?: string;
  tag?: string;
}

export interface CreatePayloadLibraryEntryInput {
  workspaceId: string;
  category: PayloadCategory;
  title: string;
  description: string;
  example: string;
  references?: string[];
  tags?: string[];
  createdBy: string;
}

export type UpdatePayloadLibraryEntryInput = Partial<
  Omit<CreatePayloadLibraryEntryInput, 'workspaceId' | 'createdBy'>
> & { aiExplanation?: string | null };

export interface PayloadLibraryRepository {
  create(input: CreatePayloadLibraryEntryInput): Promise<PayloadLibraryEntry>;
  findById(id: string): Promise<PayloadLibraryEntry | null>;
  /// A seed entry (workspaceId null) is readable by every workspace but
  /// only mutable by nobody (no createdBy) — the command handler checks
  /// `entry.workspaceId === callerWorkspaceId` before allowing update/
  /// delete, same enumeration-safe-404 shape as resolveTargetForCaller.
  list(filter: ListPayloadLibraryFilter): Promise<PayloadLibraryEntry[]>;
  update(
    id: string,
    input: UpdatePayloadLibraryEntryInput,
  ): Promise<PayloadLibraryEntry>;
  softDelete(id: string): Promise<void>;
}

export const PAYLOAD_LIBRARY_REPOSITORY = Symbol('PAYLOAD_LIBRARY_REPOSITORY');
