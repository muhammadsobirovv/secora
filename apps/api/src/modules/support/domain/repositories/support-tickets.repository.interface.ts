import type { SupportTicketCategory, SupportTicketStatus } from '@pentesthub/shared';

/// Module 15 — Support system (task #355). Defined locally rather than
/// imported from `prisma-types.js` (unlike every other repository
/// interface in this codebase) because `SupportTicket` is a brand-new
/// Prisma model added this task, and this sandbox cannot run
/// `npx prisma generate` (the `prisma` CLI package itself is absent from
/// the local pnpm store — see task #351/#352's disclosed jest-
/// unavailability finding; this is the same category of gap, just for a
/// different package). The generated client at
/// `apps/api/generated/prisma/` therefore has no `SupportTicket` export
/// yet. This interface is written to match `schema.prisma`'s
/// `SupportTicket` model field-for-field, so once `npx prisma generate`
/// is run on a normal machine (required before this module can actually
/// run — disclosed in this task's completion notes), the Prisma-backed
/// implementation below will line up with the real generated type with
/// no further changes needed.
export interface SupportTicket {
  id: string;
  userId: string | null;
  workspaceId: string | null;
  email: string;
  category: SupportTicketCategory;
  subject: string;
  message: string;
  status: SupportTicketStatus;
  diagnosticsSnapshot: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSupportTicketInput {
  userId: string | null;
  workspaceId: string | null;
  email: string;
  category: SupportTicketCategory;
  subject: string;
  message: string;
  diagnosticsSnapshot?: unknown;
}

export interface SupportTicketsRepository {
  create(input: CreateSupportTicketInput): Promise<SupportTicket>;
  /// Matches by the caller's authenticated account email, not `userId` —
  /// see this module's doc comment on why ticket creation can't reliably
  /// populate `userId` (the intake endpoint is `@Public()` and this
  /// codebase has no optional-auth guard to resolve an identity from an
  /// optionally-present token without building new cross-cutting guard
  /// infrastructure).
  findByEmail(email: string, take: number): Promise<SupportTicket[]>;
}

export const SUPPORT_TICKETS_REPOSITORY = Symbol('SUPPORT_TICKETS_REPOSITORY');
