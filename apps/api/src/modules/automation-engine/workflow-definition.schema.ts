import { z } from 'zod';
import { HttpStatus } from '@nestjs/common';
import {
  WORKFLOW_CONDITION_OPERATORS,
  WORKFLOW_STEP_KINDS,
  type WorkflowDefinition,
} from '@pentesthub/shared';
import { AppException } from '../../common/exceptions/app.exception.js';

/// `zod` is already a direct dependency of apps/api (env.validation.ts
/// uses it for boot-time config validation) — reused here rather than
/// adding a new dependency, same "no new npm package this sandbox can't
/// verify installs cleanly" posture as the rest of Module 10.
///
/// This is the runtime source of truth for what a valid
/// `Workflow.definitionJson` looks like; packages/shared/src/
/// automation-engine.ts's `WorkflowDefinition`/`WorkflowStepDefinition`
/// types are the compile-time mirror of this shape (kept in sync by
/// hand — see that file's top comment).
const stepDefinitionSchema: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    key: z.string().min(1).max(64),
    kind: z.enum(WORKFLOW_STEP_KINDS),
    params: z.record(z.string(), z.unknown()).default({}),
    next: z.string().nullable().optional(),
    onFailure: z.string().nullable().optional(),
  }),
);

const workflowDefinitionSchema = z.object({
  startAt: z.string().min(1),
  steps: z.array(stepDefinitionSchema).min(1).max(100),
});

const conditionParamsSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(WORKFLOW_CONDITION_OPERATORS),
  value: z.unknown().optional(),
  whenTrue: z.string().nullable(),
  whenFalse: z.string().nullable(),
});

const loopParamsSchema = z.object({
  itemsField: z.string().min(1),
  steps: z.array(stepDefinitionSchema).min(1).max(20),
});

const delayParamsSchema = z.object({
  minutes: z.number().int().positive().max(60 * 24 * 7), // cap at 7 days
});

/// Validates structural shape (Zod) AND the graph-level invariants Zod
/// alone can't express: every `next`/`whenTrue`/`whenFalse`/`onFailure`
/// reference must point at a step key that actually exists in `steps`,
/// and `startAt` must exist too — a workflow with a dangling pointer
/// would only fail at execution time (mid-run, potentially after
/// side-effecting steps already ran) without this check.
export function validateWorkflowDefinition(raw: unknown): WorkflowDefinition {
  const parsed = workflowDefinitionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppException(
      'WORKFLOW_DEFINITION_INVALID',
      `Invalid workflow definition: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      HttpStatus.BAD_REQUEST,
    );
  }

  const definition = parsed.data as WorkflowDefinition;
  const keys = new Set(definition.steps.map((s) => s.key));
  if (keys.size !== definition.steps.length) {
    throw new AppException('WORKFLOW_DEFINITION_INVALID', 'Duplicate step keys in workflow definition.', HttpStatus.BAD_REQUEST);
  }
  if (!keys.has(definition.startAt)) {
    throw new AppException(
      'WORKFLOW_DEFINITION_INVALID',
      `startAt "${definition.startAt}" does not match any step key.`,
      HttpStatus.BAD_REQUEST,
    );
  }

  for (const step of definition.steps) {
    if (step.kind === 'condition') {
      const cond = conditionParamsSchema.safeParse(step.params);
      if (!cond.success) {
        throw new AppException(
          'WORKFLOW_DEFINITION_INVALID',
          `Step "${step.key}" (condition) has invalid params: ${cond.error.issues.map((i) => i.message).join('; ')}`,
          HttpStatus.BAD_REQUEST,
        );
      }
      for (const target of [cond.data.whenTrue, cond.data.whenFalse]) {
        if (target !== null && !keys.has(target)) {
          throw new AppException(
            'WORKFLOW_DEFINITION_INVALID',
            `Step "${step.key}" branches to unknown step "${target}".`,
            HttpStatus.BAD_REQUEST,
          );
        }
      }
    } else if (step.kind === 'loop') {
      const loop = loopParamsSchema.safeParse(step.params);
      if (!loop.success) {
        throw new AppException(
          'WORKFLOW_DEFINITION_INVALID',
          `Step "${step.key}" (loop) has invalid params: ${loop.error.issues.map((i) => i.message).join('; ')}`,
          HttpStatus.BAD_REQUEST,
        );
      }
    } else if (step.kind === 'delay') {
      const delay = delayParamsSchema.safeParse(step.params);
      if (!delay.success) {
        throw new AppException(
          'WORKFLOW_DEFINITION_INVALID',
          `Step "${step.key}" (delay) has invalid params: ${delay.error.issues.map((i) => i.message).join('; ')}`,
          HttpStatus.BAD_REQUEST,
        );
      }
    } else if (step.next && !keys.has(step.next)) {
      throw new AppException(
        'WORKFLOW_DEFINITION_INVALID',
        `Step "${step.key}" points to unknown next step "${step.next}".`,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (step.onFailure && !keys.has(step.onFailure)) {
      throw new AppException(
        'WORKFLOW_DEFINITION_INVALID',
        `Step "${step.key}" has an onFailure pointing to unknown step "${step.onFailure}".`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  return definition;
}
