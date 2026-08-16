import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { ScopeValidationResultDto } from '@pentesthub/shared';
import { AppException } from '../../common/exceptions/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  classifyScopeValue,
  type ScopeRule,
} from '../bugbounty/scope/classify-scope-value.util.js';

export interface ScopeEngineTargetInput {
  id: string;
  type: string;
  value: string;
  scopeStatus: 'IN_SCOPE' | 'OUT_OF_SCOPE' | 'PENDING_REVIEW';
  projectId: string;
}

export interface AssertExecutionAllowedInput {
  userId: string;
  workspaceId: string;
  target: ScopeEngineTargetInput;
  /// A short machine-readable label for what's about to run — logged in
  /// the audit trail and surfaced in the thrown exception's message.
  /// Examples: "RECON_JOB", "VULN_SCAN", "AD_HOC_COMMAND",
  /// "AI_INVESTIGATION_STEP".
  operationType: string;
  ipAddress?: string;
  userAgent?: string;
}

/// Module 16 — task #370. The single most safety-critical service this
/// module introduces: every automated tool execution (Recon job, Vuln
/// scan, ad-hoc Terminal command, AI Investigation step) MUST call
/// `assertExecutionAllowed()` before doing any real work. See
/// docs/architecture/scope-engine.md and ADR 0016 §2.
///
/// Decision order, matching spec section 4 exactly:
///   1. Resolve target — done by the caller (a Target row is passed in,
///      already fetched via `resolveTargetForCaller`, which itself
///      already enforces workspace membership/RBAC — this service does
///      not re-check "does this user have access to this workspace,"
///      only "is this specific target safe to run tools against").
///   2. Match against program scope — every BugBountyProgram this
///      target is linked to (via BugBountyProgramTarget) contributes its
///      ScopeItem rules; `classifyScopeValue` (Module 6/9, reused
///      verbatim, not reimplemented) determines IN_SCOPE/OUT_OF_SCOPE/
///      UNKNOWN with OUT_OF_SCOPE always winning.
///   3. Check out-of-scope rules — an explicit OUT_OF_SCOPE match from
///      ANY linked program is an immediate, unconditional deny.
///   4. Check user permissions — delegated to whatever guard already
///      protects the calling controller/command (RBAC); this service
///      assumes the caller already passed that check, consistent with
///      "don't re-implement Module 1's authorization a second time."
///   5. Require explicit authorization state — `Target.scopeStatus` must
///      be IN_SCOPE. PENDING_REVIEW is a soft deny (the target hasn't
///      been reviewed yet, even if no program scope rule contradicts
///      it) — this is deliberately NOT the same as OUT_OF_SCOPE, and the
///      thrown error code differs (`TARGET_SCOPE_PENDING_REVIEW` vs
///      `TARGET_OUT_OF_SCOPE`) so a client can tell "go review it" from
///      "this is forbidden."
///   6. Record the decision in audit logs — every call, allow or deny,
///      writes an AuditEvent. The write is best-effort (a transient
///      audit-log failure must not silently make a scope decision opaque
///      by throwing a different, confusing error) but is never skipped
///      outright — logged as a warning if it fails, matching the
///      established "best-effort side write" posture from
///      SubscriptionService's legacy-field sync (Module 15).
@Injectable()
export class ScopeEngineService {
  private readonly logger = new Logger(ScopeEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async assertExecutionAllowed(
    input: AssertExecutionAllowedInput,
  ): Promise<ScopeValidationResultDto> {
    const result = await this.evaluate(input.target);

    await this.recordDecision(input, result);

    if (result.decision === 'DENIED_OUT_OF_SCOPE') {
      throw new AppException(
        'TARGET_OUT_OF_SCOPE',
        `Refusing to run ${input.operationType} against this target: it is explicitly marked OUT_OF_SCOPE (${result.reason}).`,
        HttpStatus.FORBIDDEN,
      );
    }
    if (result.decision === 'DENIED_PENDING_REVIEW') {
      throw new AppException(
        'TARGET_SCOPE_PENDING_REVIEW',
        `Refusing to run ${input.operationType}: this target's scope status is still PENDING_REVIEW. Mark it IN_SCOPE (or link it to a program scope rule that classifies it IN_SCOPE) before running automated tools.`,
        HttpStatus.FORBIDDEN,
      );
    }
    if (result.decision === 'DENIED_POLICY') {
      throw new AppException(
        'SCOPE_AUTHORIZATION_REQUIRED',
        `Refusing to run ${input.operationType}: ${result.reason}`,
        HttpStatus.FORBIDDEN,
      );
    }

    return result;
  }

  /// Read-only variant for UI hints (e.g. disabling a "Run Scan" button)
  /// — does not throw and does not write an audit event, since nothing
  /// is actually about to execute.
  async evaluate(
    target: ScopeEngineTargetInput,
  ): Promise<ScopeValidationResultDto> {
    const now = new Date().toISOString();

    if (target.scopeStatus === 'OUT_OF_SCOPE') {
      return {
        decision: 'DENIED_OUT_OF_SCOPE',
        targetId: target.id,
        targetScopeStatus: target.scopeStatus,
        matchedProgramScopeItemId: null,
        matchedProgramScopeClassification: null,
        reason: "Target.scopeStatus is OUT_OF_SCOPE",
        evaluatedAt: now,
      };
    }

    const programLinks = await this.prisma.bugBountyProgramTarget.findMany({
      where: { targetId: target.id },
      select: { programId: true },
    });

    if (programLinks.length > 0) {
      const scopeItems = await this.prisma.bugBountyProgramScopeItem.findMany({
        where: { programId: { in: programLinks.map((l) => l.programId) } },
      });
      const rules: ScopeRule[] = scopeItems.map((item) => ({
        id: item.id,
        type: item.type,
        pattern: item.pattern,
        classification: item.classification,
      }));
      const match = classifyScopeValue(target.value, rules);

      if (match.classification === 'OUT_OF_SCOPE') {
        return {
          decision: 'DENIED_OUT_OF_SCOPE',
          targetId: target.id,
          targetScopeStatus: target.scopeStatus,
          matchedProgramScopeItemId: match.matchedScopeItemId,
          matchedProgramScopeClassification: match.classification,
          reason: `Matched an OUT_OF_SCOPE program scope rule (pattern: ${match.matchedPattern ?? 'n/a'})`,
          evaluatedAt: now,
        };
      }
    }

    if (target.scopeStatus === 'PENDING_REVIEW') {
      return {
        decision: 'DENIED_PENDING_REVIEW',
        targetId: target.id,
        targetScopeStatus: target.scopeStatus,
        matchedProgramScopeItemId: null,
        matchedProgramScopeClassification: null,
        reason: 'Target.scopeStatus is PENDING_REVIEW and no program scope rule confirms it IN_SCOPE',
        evaluatedAt: now,
      };
    }

    return {
      decision: 'ALLOWED',
      targetId: target.id,
      targetScopeStatus: target.scopeStatus,
      matchedProgramScopeItemId: null,
      matchedProgramScopeClassification: null,
      reason: 'Target.scopeStatus is IN_SCOPE and no OUT_OF_SCOPE program rule matched',
      evaluatedAt: now,
    };
  }

  private async recordDecision(
    input: AssertExecutionAllowedInput,
    result: ScopeValidationResultDto,
  ): Promise<void> {
    try {
      await this.auditService.log({
        userId: input.userId,
        type: result.decision === 'ALLOWED' ? 'SCOPE_VALIDATION_ALLOWED' : 'SCOPE_VALIDATION_DENIED',
        ipAddress: input.ipAddress ?? 'internal',
        userAgent: input.userAgent ?? `scope-engine/${input.operationType}`,
        metadata: {
          targetId: input.target.id,
          workspaceId: input.workspaceId,
          operationType: input.operationType,
          decision: result.decision,
          reason: result.reason,
        },
      });
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to write scope-validation audit event for target ${input.target.id}: ${String(error)}`,
      );
    }
  }
}
