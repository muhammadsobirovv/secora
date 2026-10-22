import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../prisma/prisma-transaction.types.js';
import { scopeRuleFor, type OwnershipMethodName } from './scope-guard.js';
import type { ScopeRule } from './scope.util.js';

/// Turns "how did the user prove they own this target" into "what may the scan
/// touch" (see scopeRuleFor). Read-only; the verification itself lives in
/// TargetOwnershipService. A target that is somehow unverified or has no method
/// recorded gets the narrowest rule, the single verified host.
@Injectable()
export class OwnershipScopeService {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  async ruleFor(
    target: { id: string; type: string },
    host: string,
  ): Promise<ScopeRule> {
    const row = await this.txHost.tx.targetOwnershipVerification.findUnique({
      where: { targetId: target.id },
      select: { method: true, verifiedAt: true },
    });
    const method: OwnershipMethodName | null = row?.verifiedAt
      ? (row.method ?? null)
      : null;
    return scopeRuleFor({ host, targetType: target.type, method });
  }
}
