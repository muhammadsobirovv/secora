import type { DistributedJobPriority } from '../../prisma-types.js';

/// Priority scheduling total order — CRITICAL claims before HIGH before
/// NORMAL before LOW. Used both by the Prisma `orderBy` in
/// `ClaimNextJobsHandler` (a DB-level hint) and the in-memory re-sort that
/// follows it (belt-and-suspenders: Prisma's enum `orderBy: 'desc'` sorts
/// lexically by the enum's declaration order in Postgres, which happens to
/// match here, but the explicit numeric map makes the intent unambiguous
/// and immune to a future enum-reordering mistake).
export const PRIORITY_ORDER: Record<DistributedJobPriority, number> = {
  CRITICAL: 4,
  HIGH: 3,
  NORMAL: 2,
  LOW: 1,
};
