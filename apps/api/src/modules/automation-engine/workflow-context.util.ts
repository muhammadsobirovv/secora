import type { WorkflowConditionOperator } from '@pentesthub/shared';

/// Dot-path lookup into a run's accumulated context (e.g.
/// "reconStep.targetCount" reads `context.reconStep.targetCount`).
/// Deliberately just property access — no bracket/array-index syntax, no
/// function calls — so a workflow definition (which may originate from a
/// non-admin workspace member, per CreateWorkflowDto's Manager+ gate)
/// can never do more than read a value out of its own run's context.
export function getByPath(source: unknown, path: string): unknown {
  if (!path) return undefined;
  let current: unknown = source;
  for (const segment of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/// Evaluates a `condition` step's params against the run's context.
/// Every comparison is null-safe (returns false rather than throwing on
/// a missing field, except `exists`, whose entire purpose is checking
/// for that case).
export function evaluateCondition(
  context: Record<string, unknown>,
  operator: WorkflowConditionOperator,
  field: string,
  value: unknown,
): boolean {
  const actual = getByPath(context, field);
  switch (operator) {
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'eq':
      return actual === value;
    case 'neq':
      return actual !== value;
    case 'contains':
      if (typeof actual === 'string') return actual.includes(String(value));
      if (Array.isArray(actual)) return actual.includes(value);
      return false;
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const a = typeof actual === 'number' ? actual : Number(actual);
      const b = typeof value === 'number' ? value : Number(value);
      if (Number.isNaN(a) || Number.isNaN(b)) return false;
      if (operator === 'gt') return a > b;
      if (operator === 'gte') return a >= b;
      if (operator === 'lt') return a < b;
      return a <= b;
    }
    default:
      return false;
  }
}
