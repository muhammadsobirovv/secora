import { randomBytes, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/// Module 13 — Workflow Builder inbound WEBHOOK trigger (task #283).
/// `workflow_webhook_triggers` is a new Module 13 table — raw SQL only,
/// same constraint as every other table this module adds (see
/// `WorkflowWebhookTrigger`'s schema.prisma doc comment).
export interface WorkflowWebhookTriggerRow {
  id: string;
  workflowId: string;
  token: string;
  createdBy: string;
  createdAt: Date;
}

@Injectable()
export class WorkflowWebhookTriggerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByWorkflowId(workflowId: string): Promise<WorkflowWebhookTriggerRow | null> {
    const rows = await this.prisma.$queryRaw<WorkflowWebhookTriggerRow[]>`
      SELECT * FROM "workflow_webhook_triggers" WHERE "workflowId" = ${workflowId} LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async findByToken(token: string): Promise<WorkflowWebhookTriggerRow | null> {
    const rows = await this.prisma.$queryRaw<WorkflowWebhookTriggerRow[]>`
      SELECT * FROM "workflow_webhook_triggers" WHERE "token" = ${token} LIMIT 1
    `;
    return rows[0] ?? null;
  }

  /// Rotates (deletes any existing trigger for this workflow, then
  /// creates a new one) rather than reusing a row — a caller who lost
  /// track of a previously-issued token should be able to invalidate it
  /// by simply calling this again, with no separate "revoke" endpoint.
  async rotate(workflowId: string, createdBy: string): Promise<WorkflowWebhookTriggerRow> {
    await this.prisma.$executeRaw`DELETE FROM "workflow_webhook_triggers" WHERE "workflowId" = ${workflowId}`;
    const token = randomBytes(24).toString('hex');
    const rows = await this.prisma.$queryRaw<WorkflowWebhookTriggerRow[]>`
      INSERT INTO "workflow_webhook_triggers" ("id", "workflowId", "token", "createdBy")
      VALUES (${randomUUID()}, ${workflowId}, ${token}, ${createdBy})
      RETURNING *
    `;
    return rows[0]!;
  }
}
