import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Prisma } from '../../prisma-types.js';

/// Module 15 — task #352 (demo mode). Populates a freshly created demo
/// workspace with realistic-looking, already-completed sample data —
/// never anything a live tool run produced. Writes go straight through
/// `PrismaService` rather than the normal command/repository layer
/// deliberately: every one of those commands assumes it's creating a
/// *live, in-progress* job a worker will pick up next; this seed needs
/// rows that are born already `COMPLETED` with synthetic findings
/// attached, which isn't a shape those commands support (and shouldn't —
/// they're not the place to add a backdoor for injecting fake results).
/// `ReconFinding.data`/`VulnFinding.data` are untyped `Json` columns by
/// design (see their schema.prisma doc comments), so this only needs to
/// be *plausible*, not byte-for-byte what a real tool adapter emits.
@Injectable()
export class DemoSeedService {
  constructor(private readonly prisma: PrismaService) {}

  async seed(workspaceId: string, userId: string): Promise<void> {
    const project = await this.prisma.project.create({
      data: {
        workspaceId,
        name: 'Acme Corp — External Pentest',
        description: 'Sample engagement pre-loaded for the demo. Nothing here was scanned live.',
        status: 'ACTIVE',
        createdBy: userId,
      },
    });

    const webTarget = await this.prisma.target.create({
      data: {
        projectId: project.id,
        type: 'DOMAIN',
        value: 'app.acme-demo.example',
        name: 'Main web application',
        environment: 'PRODUCTION',
        scopeStatus: 'IN_SCOPE',
        createdBy: userId,
      },
    });

    const apiTarget = await this.prisma.target.create({
      data: {
        projectId: project.id,
        type: 'API',
        value: 'api.acme-demo.example',
        name: 'Public API',
        environment: 'PRODUCTION',
        scopeStatus: 'IN_SCOPE',
        createdBy: userId,
      },
    });

    await this.prisma.note.create({
      data: {
        projectId: project.id,
        targetId: webTarget.id,
        title: "You're exploring a demo",
        content:
          'This workspace is pre-loaded with sample projects, targets, and findings so you can see what PentestHub AI looks like in use. New recon and vulnerability scans are disabled here — sign up for a free account to run real ones against your own targets.',
        authorId: userId,
      },
    });

    const now = new Date();
    const completedAt = now;
    const startedAt = new Date(now.getTime() - 4 * 60_000);

    const reconJob = await this.prisma.reconJob.create({
      data: {
        workspaceId,
        projectId: project.id,
        targetId: webTarget.id,
        tools: ['SUBFINDER', 'HTTPX', 'NMAP'],
        status: 'COMPLETED',
        startedAt,
        completedAt,
        requestedBy: userId,
      },
    });

    const reconFindings: { type: string; value: string; source: string; data: Record<string, unknown> }[] = [
      { type: 'SUBDOMAIN', value: 'app.acme-demo.example', source: 'SUBFINDER', data: { discoveredVia: 'certificate transparency' } },
      { type: 'SUBDOMAIN', value: 'staging.acme-demo.example', source: 'SUBFINDER', data: { discoveredVia: 'certificate transparency' } },
      { type: 'OPEN_PORT', value: '443/tcp', source: 'NMAP', data: { port: 443, protocol: 'tcp', state: 'open' } },
      { type: 'OPEN_PORT', value: '22/tcp', source: 'NMAP', data: { port: 22, protocol: 'tcp', state: 'open' } },
      { type: 'HTTP_HEADER', value: 'Server: nginx/1.24.0', source: 'HTTPX', data: { header: 'Server', value: 'nginx/1.24.0' } },
      { type: 'SECURITY_HEADER', value: 'Missing: Content-Security-Policy', source: 'HTTPX', data: { header: 'Content-Security-Policy', present: false } },
    ];
    for (const finding of reconFindings) {
      await this.prisma.reconFinding.create({
        data: {
          jobId: reconJob.id,
          workspaceId,
          projectId: project.id,
          targetId: webTarget.id,
          type: finding.type as never,
          value: finding.value,
          data: finding.data as Prisma.InputJsonValue,
          source: finding.source as never,
          dedupKey: `demo-${finding.type}-${finding.value}`,
        },
      });
    }

    const vulnJob = await this.prisma.vulnScanJob.create({
      data: {
        workspaceId,
        projectId: project.id,
        targetId: apiTarget.id,
        scanners: ['NUCLEI', 'FFUF'],
        status: 'COMPLETED',
        startedAt,
        completedAt,
        requestedBy: userId,
      },
    });

    const vulnFindings: {
      title: string;
      description: string;
      severity: string;
      cvssScore: number | null;
      scanner: string;
      vulnType: string;
      path: string;
    }[] = [
      {
        title: 'Missing rate limiting on authentication endpoint',
        description: 'The /api/auth/login endpoint accepts unlimited requests per source IP, allowing credential-stuffing attacks.',
        severity: 'MEDIUM',
        cvssScore: 5.3,
        scanner: 'NUCLEI',
        vulnType: 'missing-rate-limit',
        path: '/api/auth/login',
      },
      {
        title: 'Verbose error messages expose stack traces',
        description: 'Malformed JSON bodies return a full stack trace including internal file paths.',
        severity: 'LOW',
        cvssScore: 3.1,
        scanner: 'FFUF',
        vulnType: 'information-disclosure',
        path: '/api/v1/reports',
      },
      {
        title: 'Outdated TLS cipher suite offered',
        description: 'The server still negotiates TLS_RSA_WITH_AES_128_CBC_SHA alongside modern cipher suites.',
        severity: 'INFO',
        cvssScore: null,
        scanner: 'NUCLEI',
        vulnType: 'weak-tls-config',
        path: '/',
      },
    ];
    for (const finding of vulnFindings) {
      await this.prisma.vulnFinding.create({
        data: {
          jobId: vulnJob.id,
          workspaceId,
          projectId: project.id,
          targetId: apiTarget.id,
          title: finding.title,
          description: finding.description,
          severity: finding.severity as never,
          cvssScore: finding.cvssScore,
          scanner: finding.scanner as never,
          vulnType: finding.vulnType,
          path: finding.path,
          signature: `demo-${finding.vulnType}`,
          matchedAt: finding.path,
          data: { demo: true },
          dedupKey: `demo-${finding.vulnType}-${finding.path}`,
          tags: ['demo'],
        },
      });
    }
  }
}
