import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { RelayCommandStatus, RelayCommandTarget } from '@pentesthub/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Prisma } from '../../prisma-types.js';

/// Module 13 — Local Execution (task #288). `relay_commands` is a new
/// Module 13 table with no generated Prisma Client support — raw SQL
/// only, same `Prisma.sql`/`Prisma.empty` pattern as `AgentSdkRepository`/
/// `McpSessionRepository`.

export interface RelayCommandRow {
  id: string;
  workspaceId: string;
  target: RelayCommandTarget;
  commandType: string;
  payloadJson: Record<string, unknown>;
  status: RelayCommandStatus;
  resultJson: unknown;
  createdBy: string | null;
  createdAt: Date;
  deliveredAt: Date | null;
  completedAt: Date | null;
}

@Injectable()
export class RelayCommandsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(params: {
    workspaceId: string;
    target: RelayCommandTarget;
    commandType: string;
    payload: Record<string, unknown>;
    createdBy: string | null;
  }): Promise<RelayCommandRow> {
    const rows = await this.prisma.$queryRaw<RelayCommandRow[]>`
      INSERT INTO "relay_commands"
        ("id", "workspaceId", "target", "commandType", "payloadJson", "status", "createdBy")
      VALUES
        (${randomUUID()}, ${params.workspaceId}, ${params.target}::"RelayCommandTarget", ${params.commandType}, ${JSON.stringify(params.payload)}::jsonb, 'PENDING'::"RelayCommandStatus", ${params.createdBy})
      RETURNING *
    `;
    return rows[0]!;
  }

  async findById(id: string): Promise<RelayCommandRow | null> {
    const rows = await this.prisma.$queryRaw<RelayCommandRow[]>`
      SELECT * FROM "relay_commands" WHERE "id" = ${id} LIMIT 1
    `;
    return rows[0] ?? null;
  }

  /// Polled by a connected Desktop Agent / Browser Extension session —
  /// returns PENDING commands for the workspace+target and, in the same
  /// call, flips them to DELIVERED (`deliveredAt = now()`) so a second
  /// concurrent poll doesn't also pick them up. There is deliberately no
  /// re-delivery/retry timeout in this v1 — if a client crashes after
  /// polling but before completing, the command stays DELIVERED forever;
  /// `RelayCommandsController`'s doc comment discloses this as a known
  /// gap alongside the not-yet-wired client poll loop itself.
  async claimPending(workspaceId: string, target: RelayCommandTarget, limit: number): Promise<RelayCommandRow[]> {
    return this.prisma.$queryRaw<RelayCommandRow[]>(
      Prisma.sql`
        UPDATE "relay_commands"
        SET "status" = 'DELIVERED'::"RelayCommandStatus", "deliveredAt" = now()
        WHERE "id" IN (
          SELECT "id" FROM "relay_commands"
          WHERE "workspaceId" = ${workspaceId} AND "target" = ${target}::"RelayCommandTarget" AND "status" = 'PENDING'::"RelayCommandStatus"
          ORDER BY "createdAt" ASC
          LIMIT ${limit}
        )
        RETURNING *
      `,
    );
  }

  async complete(params: {
    id: string;
    workspaceId: string;
    status: 'COMPLETED' | 'FAILED';
    result: unknown;
  }): Promise<RelayCommandRow | null> {
    const rows = await this.prisma.$queryRaw<RelayCommandRow[]>`
      UPDATE "relay_commands"
      SET "status" = ${params.status}::"RelayCommandStatus",
          "resultJson" = ${params.result !== undefined ? JSON.stringify(params.result) : null}::jsonb,
          "completedAt" = now()
      WHERE "id" = ${params.id} AND "workspaceId" = ${params.workspaceId}
      RETURNING *
    `;
    return rows[0] ?? null;
  }
}
