import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { MarketplaceScanResultDto, PluginChecksumDto } from '@pentesthub/shared';
import { AppException } from '../../common/exceptions/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PluginDependencyDto } from '@pentesthub/shared';

/// One regex per known secret shape — deliberately small and named so a
/// finding says *what* pattern matched, not just "secret found".
/// Intentionally not exhaustive (no paid secret-scanning vendor is
/// integrated — see this file's class doc comment); a real production
/// deployment handling third-party plugin code at scale should still run
/// a dedicated tool (gitleaks/trufflehog) in front of this, the same way
/// Module 14's CI pipeline runs Trivy/cargo-audit rather than relying on
/// hand-written patterns for container/dependency scanning.
const SECRET_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: 'aws-access-key-id', pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'generic-private-key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: 'slack-token', pattern: /xox[baprs]-[0-9A-Za-z-]{10,}/ },
  { name: 'generic-bearer-secret', pattern: /(?:api[_-]?key|secret|token)["']?\s*[:=]\s*["'][A-Za-z0-9_\-]{20,}["']/i },
  { name: 'github-token', pattern: /gh[pousr]_[A-Za-z0-9]{36,}/ },
];

/// Node APIs a sandboxed plugin has no legitimate reason to touch
/// directly — `PluginSandboxService` (Module 10/13) already restricts
/// what a plugin's `vm` context can `require()` at *execution* time; this
/// is a *publish-time* heuristic flag so a reviewer sees the risk before
/// a version is ever installed, not just when the sandbox happens to
/// block it.
const DANGEROUS_API_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: 'child-process-spawn', pattern: /require\(\s*['"]child_process['"]\s*\)/ },
  { name: 'dynamic-eval', pattern: /\beval\s*\(/ },
  { name: 'dynamic-function-constructor', pattern: /new\s+Function\s*\(/ },
  { name: 'fs-write', pattern: /require\(\s*['"]fs['"]\s*\)[\s\S]{0,200}\.(writeFile|unlink|rmdir|rm)/ },
];

/// Module 15 — Marketplace security (task #333). Best-effort static
/// analysis run in-process at publish time — no external scanning
/// service or paid API required, so this works identically for a
/// self-hosted Community Edition instance and for Secora Cloud.
/// Never blocks a publish on its own (a scan result is recorded and
/// surfaced via `PluginChecksumDto.scanResults`/the "Verified" badge
/// logic, not a hard gate) — see `MarketplaceScanResult`'s doc comment
/// in schema.prisma for why "never scanned" and "scanned clean" are kept
/// visibly distinct.
@Injectable()
export class MarketplaceScannerService {
  private readonly logger = new Logger(MarketplaceScannerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async scanVersion(
    pluginVersionId: string,
    sourceCode: string | null,
    dependencies: PluginDependencyDto[] | null,
  ): Promise<MarketplaceScanResultDto[]> {
    const results = await Promise.all([
      this.recordResult(pluginVersionId, 'secret', this.scanForSecrets(sourceCode ?? '')),
      this.recordResult(pluginVersionId, 'malware-heuristic', this.scanForDangerousApis(sourceCode ?? '')),
      this.recordResult(pluginVersionId, 'dependency', this.scanDependencies(dependencies ?? [])),
    ]);
    return results;
  }

  /// `PluginChecksumDto` — the "verify this download out-of-band"
  /// contract `MARKETPLACE_SECURITY_ENDPOINTS.pluginChecksum` serves.
  async getChecksum(pluginVersionId: string): Promise<PluginChecksumDto> {
    const version = await this.prisma.pluginVersion.findUnique({
      where: { id: pluginVersionId },
      include: { scanResults: true },
    });
    if (!version) {
      throw new AppException('PLUGIN_NOT_FOUND', `No plugin version with id "${pluginVersionId}".`, HttpStatus.NOT_FOUND);
    }
    return {
      pluginVersionId: version.id,
      checksumSha256: version.checksumSha256,
      signaturePresent: Boolean(version.signature),
      reviewStatus: version.reviewStatus,
      scanResults: version.scanResults.map((result) => ({
        id: result.id,
        pluginVersionId: result.pluginVersionId,
        scanType: result.scanType,
        passed: result.passed,
        findings: result.findings,
        scannedAt: result.scannedAt.toISOString(),
      })),
    };
  }

  private scanForSecrets(sourceCode: string): { passed: boolean; findings: unknown } {
    const matches = SECRET_PATTERNS.filter((entry) => entry.pattern.test(sourceCode)).map((entry) => entry.name);
    return { passed: matches.length === 0, findings: matches.length > 0 ? { matchedPatterns: matches } : null };
  }

  private scanForDangerousApis(sourceCode: string): { passed: boolean; findings: unknown } {
    const matches = DANGEROUS_API_PATTERNS.filter((entry) => entry.pattern.test(sourceCode)).map((entry) => entry.name);
    return { passed: matches.length === 0, findings: matches.length > 0 ? { matchedPatterns: matches } : null };
  }

  private scanDependencies(dependencies: PluginDependencyDto[]): { passed: boolean; findings: unknown } {
    const unpinned = dependencies
      .filter((dep) => dep.versionRange === '*' || dep.versionRange.toLowerCase() === 'latest')
      .map((dep) => dep.slug);
    return { passed: unpinned.length === 0, findings: unpinned.length > 0 ? { unpinnedDependencies: unpinned } : null };
  }

  private async recordResult(
    pluginVersionId: string,
    scanType: string,
    result: { passed: boolean; findings: unknown },
  ): Promise<MarketplaceScanResultDto> {
    const row = await this.prisma.marketplaceScanResult.create({
      data: {
        pluginVersionId,
        scanType,
        passed: result.passed,
        findings: result.findings as never,
      },
    });
    if (!result.passed) {
      this.logger.warn(`Marketplace scan "${scanType}" flagged plugin version ${pluginVersionId}: ${JSON.stringify(result.findings)}`);
    }
    return {
      id: row.id,
      pluginVersionId: row.pluginVersionId,
      scanType: row.scanType,
      passed: row.passed,
      findings: row.findings,
      scannedAt: row.scannedAt.toISOString(),
    };
  }
}
