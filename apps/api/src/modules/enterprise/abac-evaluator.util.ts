import type { PrismaService } from '../../prisma/prisma.service.js';
import type { EnterpriseRole } from '../../prisma-types.js';

export interface AbacContext {
  organizationId: string;
  userId: string;
  role: EnterpriseRole;
  resourceType: string;
  resourceId?: string;
  action: string;
  /// Caller-supplied resource attributes for condition matching (e.g.
  /// `{ ownerId: finding.createdBy, tags: finding.tags }`). Kept as a flat
  /// bag rather than a typed union — ABAC rules are inherently generic
  /// across resource types, the same reason `ResourcePermission.conditions`
  /// is `Json?` rather than a per-resource-type column set.
  attributes?: Record<string, unknown>;
}

export type AbacDecision = 'ALLOW' | 'DENY' | 'NOT_SET';

/// Evaluates a simple condition object against `attributes`: every key
/// must match, `"$self"` resolves to the caller's own userId (the common
/// "only the owner" case), array values match via `includes`. Returns
/// true when there are no conditions (an unconditional rule) or every
/// condition passes.
function matchesConditions(
  conditions: Record<string, unknown> | null,
  attributes: Record<string, unknown> | undefined,
  userId: string,
): boolean {
  if (!conditions || Object.keys(conditions).length === 0) {
    return true;
  }
  const attrs = attributes ?? {};
  return Object.entries(conditions).every(([key, expected]) => {
    const actual = attrs[key];
    const resolvedExpected = expected === '$self' ? userId : expected;
    if (Array.isArray(actual)) {
      return actual.includes(resolvedExpected);
    }
    return actual === resolvedExpected;
  });
}

/// Evaluates `ResourcePermission` rows (ABAC) for one action on one
/// resource. Precedence, most to least specific: an exact `resourceId`
/// match beats a `resourceId: null` (resource-type-wide) match; within the
/// same specificity, any matching DENY beats any matching ALLOW ("most
/// restrictive wins" — the same rule Module 6's scope classifier uses for
/// OUT_OF_SCOPE vs IN_SCOPE, and Module 9's role-rank ceiling mirrors in
/// spirit). Returns `NOT_SET` when no rule matches at all, so callers can
/// fall back to plain RBAC (`requireEnterpriseRole`) — ABAC here is an
/// additive override layer, not a replacement for the role ladder.
export async function evaluateAbac(prisma: PrismaService, ctx: AbacContext): Promise<AbacDecision> {
  const memberTeamIds = await prisma.teamMember
    .findMany({
      where: { organizationMember: { organizationId: ctx.organizationId, userId: ctx.userId } },
      select: { teamId: true },
    })
    .then((rows) => rows.map((r) => r.teamId));

  const candidates = await prisma.resourcePermission.findMany({
    where: {
      organizationId: ctx.organizationId,
      resourceType: ctx.resourceType,
      action: ctx.action,
      OR: [
        { subjectType: 'USER', subjectId: ctx.userId },
        { subjectType: 'ROLE', subjectId: ctx.role },
        ...(memberTeamIds.length > 0
          ? [{ subjectType: 'TEAM' as const, subjectId: { in: memberTeamIds } }]
          : []),
      ],
    },
  });

  const matching = candidates.filter(
    (rule) =>
      (rule.resourceId === ctx.resourceId || rule.resourceId === null) &&
      matchesConditions(rule.conditions as Record<string, unknown> | null, ctx.attributes, ctx.userId),
  );
  if (matching.length === 0) {
    return 'NOT_SET';
  }

  const exact = matching.filter((r) => r.resourceId !== null);
  const scoped = exact.length > 0 ? exact : matching;
  return scoped.some((r) => r.effect === 'DENY') ? 'DENY' : 'ALLOW';
}
