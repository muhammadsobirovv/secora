import { Injectable, Logger } from '@nestjs/common';
import type { TechnologyDto } from '@pentesthub/shared';
import { PrismaService } from '../../prisma/prisma.service.js';

interface TechnologyRow {
  id: string;
  targetId: string;
  name: string;
  category: string | null;
  version: string | null;
  detectedVia: string;
  confidence: number;
  firstSeenAt: Date | string;
  lastSeenAt: Date | string;
}

interface ReconFindingTechRow {
  value: string;
  data: unknown;
}

/// Best-effort static category map for the small set of technologies
/// HTTPX/WhatWeb commonly surface — not exhaustive; unrecognized names are
/// left uncategorized rather than guessed at.
const CATEGORY_MAP: Record<string, string> = {
  nginx: 'web-server',
  apache: 'web-server',
  iis: 'web-server',
  httpserver: 'web-server',
  php: 'language',
  'x-powered-by': 'language',
  wordpress: 'cms',
  drupal: 'cms',
  joomla: 'cms',
  react: 'frontend-framework',
  vue: 'frontend-framework',
  angular: 'frontend-framework',
  jquery: 'js-library',
  bootstrap: 'css-framework',
  cloudflare: 'cdn-waf',
  varnish: 'cdn-waf',
};

function categorize(name: string): string | null {
  return CATEGORY_MAP[name.toLowerCase()] ?? null;
}

function toDto(row: TechnologyRow): TechnologyDto {
  return {
    id: row.id,
    targetId: row.targetId,
    name: row.name,
    category: row.category,
    version: row.version,
    detectedVia: row.detectedVia,
    confidence: row.confidence,
    firstSeenAt: new Date(row.firstSeenAt).toISOString(),
    lastSeenAt: new Date(row.lastSeenAt).toISOString(),
  };
}

/// Module 16 — task #374. Derives normalized `Technology` rows from
/// existing `ReconFinding` rows of type TECHNOLOGY (produced by the
/// HTTPX/WhatWeb normalizers, Module 3) — no second scanning pipeline, no
/// new ToolRunner. `value` is the raw plugin/tech string (e.g. "nginx",
/// "PHP:7.4"); this service just normalizes it into name/version and
/// upserts one row per (target, name).
@Injectable()
export class TechnologyDetectionService {
  private readonly logger = new Logger(TechnologyDetectionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async detectForTarget(
    workspaceId: string,
    projectId: string,
    targetId: string,
  ): Promise<number> {
    const findings = await this.prisma.reconFinding.findMany({
      where: { targetId, type: 'TECHNOLOGY' },
      select: { value: true, data: true },
    });

    const byName = new Map<string, { version: string | null; source: string }>();
    for (const finding of findings as ReconFindingTechRow[]) {
      const { name, version } = this.parseTechValue(finding.value);
      const data = (finding.data ?? {}) as Record<string, unknown>;
      const source = typeof data.source === 'string' ? data.source : 'recon';
      const existing = byName.get(name);
      if (!existing || (!existing.version && version)) {
        byName.set(name, { version: existing?.version ?? version, source });
      }
    }

    let upserted = 0;
    for (const [name, { version, source }] of byName) {
      try {
        await (
          this.prisma as unknown as {
            technology: { upsert: (args: unknown) => Promise<unknown> };
          }
        ).technology.upsert({
          where: { targetId_name: { targetId, name } },
          create: {
            workspaceId,
            projectId,
            targetId,
            name,
            category: categorize(name),
            version,
            detectedVia: source,
            confidence: 1,
          },
          update: {
            version: version ?? undefined,
            lastSeenAt: new Date(),
          },
        });
        upserted += 1;
      } catch (error: unknown) {
        this.logger.warn(`Failed to upsert Technology "${name}" for target ${targetId}: ${String(error)}`);
      }
    }

    return upserted;
  }

  async listForTarget(targetId: string): Promise<TechnologyDto[]> {
    const rows = await (
      this.prisma as unknown as {
        technology: { findMany: (args: unknown) => Promise<TechnologyRow[]> };
      }
    ).technology.findMany({
      where: { targetId },
      orderBy: { name: 'asc' },
    });
    return rows.map(toDto);
  }

  async countForProject(projectId: string): Promise<number> {
    return (
      this.prisma as unknown as {
        technology: { count: (args: unknown) => Promise<number> };
      }
    ).technology.count({ where: { projectId } });
  }

  /// "nginx" -> {name: "nginx", version: null}; "PHP:7.4" -> {name: "PHP",
  /// version: "7.4"}; whatweb-style entries like "HTTPServer" stay as-is
  /// (no colon to split on).
  private parseTechValue(raw: string): { name: string; version: string | null } {
    const colonIndex = raw.indexOf(':');
    if (colonIndex === -1) return { name: raw.trim(), version: null };
    const name = raw.slice(0, colonIndex).trim();
    const version = raw.slice(colonIndex + 1).trim() || null;
    return { name, version };
  }
}
