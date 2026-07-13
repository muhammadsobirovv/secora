import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp, setupSwagger } from '../src/bootstrap.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { readLatestTokenForEmail } from './mail-outbox.helper.js';
import { NucleiScannerRunner } from '../src/modules/vuln/scanner-runners/adapters/nuclei.scanner-runner.js';
import { VulnScanJobExecutionService } from '../src/modules/vuln/execution/vuln-scan-job-execution.service.js';
import {
  VULN_SCAN_JOBS_REPOSITORY,
  type VulnScanJobsRepository,
} from '../src/modules/vuln/domain/repositories/vuln-scan-jobs.repository.interface.js';

/// Mirrors test/recon.e2e-spec.ts exactly: the worker's separate entry
/// point (worker.main.ts) is never booted here — NucleiScannerRunner is
/// overridden with a fake that skips the real subprocess but still flows
/// through the REAL NucleiNormalizer/dedup/persist/evidence-attach
/// pipeline, and VulnScanJobExecutionService is invoked directly
/// (simulating one worker pass) after the job is created over real HTTP.
async function createTestApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
}> {
  const moduleBuilder = Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(NucleiScannerRunner)
    .useValue({
      scanner: 'NUCLEI',
      supportedTargetTypes: ['URL', 'DOMAIN', 'SUBDOMAIN', 'IP_ADDRESS'],
      run: () =>
        Promise.resolve({
          exitCode: 0,
          stdout: [
            JSON.stringify({
              'template-id': 'exposed-e2e-panel',
              info: {
                name: 'Exposed E2E Test Panel',
                severity: 'high',
                description:
                  'A fake admin panel is exposed without authentication.',
                tags: ['exposure', 'panel'],
                reference: ['https://example.com/advisory'],
              },
              host: 'https://e2e-vuln.example.com',
              'matched-at': 'https://e2e-vuln.example.com/admin',
              request: 'GET /admin HTTP/1.1\nHost: e2e-vuln.example.com',
              response: 'HTTP/1.1 200 OK\n\n<html>Admin Panel</html>',
              'curl-command': 'curl https://e2e-vuln.example.com/admin',
            }),
          ].join('\n'),
          timedOut: false,
        }),
    });
  const moduleRef = await moduleBuilder.compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  setupSwagger(app);
  await app.init();
  const prisma = app.get(PrismaService);
  await prisma.role.upsert({
    where: { name: 'USER' },
    update: {},
    create: { name: 'USER', description: 'Standard authenticated user' },
  });
  return { app, prisma };
}

function uniqueEmail(label: string): string {
  return `e2e-vuln-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

describe('Vulnerability Engine (e2e)', () => {
  let app: INestApplication;
  const email = uniqueEmail('main');
  const password = 'correct-horse-battery-staple';
  let accessToken: string;
  let projectId: string;
  let targetId: string;
  let jobId: string;
  let findingId: string;

  beforeAll(async () => {
    ({ app } = await createTestApp());

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, displayName: 'Vuln E2E' })
      .expect(201);
    const token = await readLatestTokenForEmail(email);
    await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token })
      .expect(204);
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    accessToken = loginRes.body.data.accessToken;

    const project = await request(app.getHttpServer())
      .post('/projects')
      .set(auth())
      .send({ name: 'Vuln E2E Project' })
      .expect(201);
    projectId = project.body.data.id;

    const target = await request(app.getHttpServer())
      .post(`/projects/${projectId}/targets`)
      .set(auth())
      .send({ type: 'URL', value: 'https://e2e-vuln.example.com' })
      .expect(201);
    targetId = target.body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  function auth() {
    return { Authorization: `Bearer ${accessToken}` };
  }

  it('creates a vulnerability scan job in PENDING status with priority', async () => {
    const created = await request(app.getHttpServer())
      .post(`/targets/${targetId}/vuln/jobs`)
      .set(auth())
      .send({ scanners: ['NUCLEI'], priority: 50 })
      .expect(201);

    jobId = created.body.data.id;
    expect(created.body.data.status).toBe('PENDING');
    expect(created.body.data.priority).toBe(50);
    expect(created.body.data.toolRuns).toHaveLength(1);
  });

  it('rejects an unrecognized scanner name at the DTO validation layer', async () => {
    await request(app.getHttpServer())
      .post(`/targets/${targetId}/vuln/jobs`)
      .set(auth())
      .send({ scanners: ['NOT_A_REAL_SCANNER'] })
      .expect(400);
  });

  it('running the execution service directly (simulating one worker pass) completes the job and produces a finding with evidence', async () => {
    const jobsRepository = app.get<VulnScanJobsRepository>(
      VULN_SCAN_JOBS_REPOSITORY,
    );
    const executionService = app.get(VulnScanJobExecutionService);

    const job = await jobsRepository.findById(jobId);
    expect(job).not.toBeNull();

    await executionService.execute(job!, new AbortController().signal);

    const completed = await request(app.getHttpServer())
      .get(`/vuln/jobs/${jobId}`)
      .set(auth())
      .expect(200);
    expect(completed.body.data.status).toBe('COMPLETED');
    expect(completed.body.data.toolRuns[0].status).toBe('COMPLETED');
    expect(completed.body.data.findingsCount).toBe(1);
  }, 15_000);

  it('lists the job finding, discovered via the real normalizer + dedup + evidence pipeline', async () => {
    const findings = await request(app.getHttpServer())
      .get(`/vuln/jobs/${jobId}/findings`)
      .set(auth())
      .expect(200);

    expect(findings.body.data).toHaveLength(1);
    expect(findings.body.data[0]).toMatchObject({
      title: 'Exposed E2E Test Panel',
      severity: 'HIGH',
      scanner: 'NUCLEI',
      status: 'NEW',
      confidence: 'CONFIRMED',
    });
    findingId = findings.body.data[0].id;
    // The normalizer attaches request/response/command text evidence —
    // confirms the finding -> Evidence FK wiring actually persisted, not
    // just the finding row itself.
    expect(findings.body.data[0].requestEvidenceId).not.toBeNull();
    expect(findings.body.data[0].responseEvidenceId).not.toBeNull();
    expect(findings.body.data[0].commandEvidenceId).not.toBeNull();

    const viaTarget = await request(app.getHttpServer())
      .get(`/targets/${targetId}/vuln/findings`)
      .set(auth())
      .expect(200);
    expect(
      viaTarget.body.data.some((f: { id: string }) => f.id === findingId),
    ).toBe(true);

    const viaWorkspaceList = await request(app.getHttpServer())
      .get('/vuln/findings')
      .set(auth())
      .query({ severity: 'HIGH' })
      .expect(200);
    expect(
      viaWorkspaceList.body.data.some(
        (f: { id: string }) => f.id === findingId,
      ),
    ).toBe(true);
  });

  it('updates a finding status and additionally emits a confirmed activity entry', async () => {
    const updated = await request(app.getHttpServer())
      .patch(`/vuln/findings/${findingId}/status`)
      .set(auth())
      .send({ status: 'CONFIRMED' })
      .expect(200);
    expect(updated.body.data.status).toBe('CONFIRMED');
  });

  it('bulk-updates finding status', async () => {
    const bulk = await request(app.getHttpServer())
      .post('/vuln/findings/bulk-status')
      .set(auth())
      .send({ findingIds: [findingId], status: 'FIXED' })
      .expect(201);
    expect(bulk.body.data).toHaveLength(1);
    expect(bulk.body.data[0].status).toBe('FIXED');
  });

  it('creates, lists, and deletes a scan template', async () => {
    const created = await request(app.getHttpServer())
      .post('/vuln/templates')
      .set(auth())
      .send({ name: 'E2E Quick Scan', scanners: ['NUCLEI', 'NIKTO'] })
      .expect(201);
    const templateId = created.body.data.id;
    expect(created.body.data.isBuiltIn).toBe(false);

    const list = await request(app.getHttpServer())
      .get('/vuln/templates')
      .set(auth())
      .expect(200);
    expect(
      list.body.data.some((t: { id: string }) => t.id === templateId),
    ).toBe(true);

    await request(app.getHttpServer())
      .delete(`/vuln/templates/${templateId}`)
      .set(auth())
      .expect(204);
  });

  it('reports the finding + job in the dashboard summary and scanner history', async () => {
    const summary = await request(app.getHttpServer())
      .get('/vuln/dashboard')
      .set(auth())
      .expect(200);
    expect(summary.body.data.totalFindings).toBeGreaterThanOrEqual(1);
    expect(
      summary.body.data.scannerHistory.some(
        (s: { scanner: string }) => s.scanner === 'NUCLEI',
      ),
    ).toBe(true);

    const history = await request(app.getHttpServer())
      .get('/vuln/scanners/history')
      .set(auth())
      .expect(200);
    const nuclei = history.body.data.find(
      (s: { scanner: string }) => s.scanner === 'NUCLEI',
    );
    expect(nuclei).toBeDefined();
    expect(nuclei.completedRuns).toBeGreaterThanOrEqual(1);
  });

  it('records every step on the Activity Timeline', async () => {
    const activity = await request(app.getHttpServer())
      .get('/activity')
      .set(auth())
      .expect(200);

    const verbs = activity.body.data.map((e: { verb: string }) => e.verb);
    expect(verbs).toEqual(
      expect.arrayContaining([
        'target.created',
        'vuln_scan_job.created',
        'vuln_scan_job.started',
        'vuln_scan_job.completed',
        'vuln_finding.created',
        'vuln_finding.confirmed',
        'vuln_finding.updated',
        'vuln_finding.resolved',
      ]),
    );
  });
});
