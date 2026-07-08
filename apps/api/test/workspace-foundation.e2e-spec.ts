import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp, setupSwagger } from '../src/bootstrap.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { readLatestTokenForEmail } from './mail-outbox.helper.js';

/// Runs against the real local dev Postgres, same setup as
/// auth.e2e-spec.ts. One shared app instance for the whole file (no
/// throttled routes are exercised repeatedly here the way Module 1's
/// login/register are), one registered+verified+logged-in user, and
/// every `it()` after registration builds on state from the previous one
/// (project -> target/note/evidence -> tags/attachments/activity/search)
/// — this mirrors how a real client would actually use the API.
async function createTestApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
}> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
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
  return `e2e-wsfoundation-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

describe('Workspace Foundation (e2e)', () => {
  let app: INestApplication;
  const email = uniqueEmail('main');
  const password = 'correct-horse-battery-staple';
  let accessToken: string;
  let projectId: string;
  let targetId: string;
  let noteId: string;
  let evidenceId: string;
  let tagId: string;

  beforeAll(async () => {
    ({ app } = await createTestApp());

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, displayName: 'WS Foundation E2E' })
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
  });

  afterAll(async () => {
    await app.close();
  });

  function auth() {
    return { Authorization: `Bearer ${accessToken}` };
  }

  it('GET /workspace returns the personal workspace created at registration', async () => {
    const res = await request(app.getHttpServer())
      .get('/workspace')
      .set(auth())
      .expect(200);
    expect(res.body.data.name).toContain('WS Foundation E2E');
  });

  it('PATCH /workspace updates the name', async () => {
    const res = await request(app.getHttpServer())
      .patch('/workspace')
      .set(auth())
      .send({ name: 'Renamed Workspace' })
      .expect(200);
    expect(res.body.data.name).toBe('Renamed Workspace');
  });

  it('creates, lists, gets, and updates a project', async () => {
    const created = await request(app.getHttpServer())
      .post('/projects')
      .set(auth())
      .send({ name: 'E2E Project', description: 'A test project' })
      .expect(201);
    projectId = created.body.data.id;
    expect(created.body.data.status).toBe('ACTIVE');
    expect(created.body.data.isFavorite).toBe(false);

    const listed = await request(app.getHttpServer())
      .get('/projects')
      .set(auth())
      .expect(200);
    expect(
      listed.body.data.some((p: { id: string }) => p.id === projectId),
    ).toBe(true);

    const got = await request(app.getHttpServer())
      .get(`/projects/${projectId}`)
      .set(auth())
      .expect(200);
    expect(got.body.data.name).toBe('E2E Project');

    const updated = await request(app.getHttpServer())
      .patch(`/projects/${projectId}`)
      .set(auth())
      .send({ status: 'ON_HOLD' })
      .expect(200);
    expect(updated.body.data.status).toBe('ON_HOLD');
  });

  it('archives, then soft-deletes, then restores the project', async () => {
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/archive`)
      .set(auth())
      .expect(201)
      .expect((res) => expect(res.body.data.status).toBe('ARCHIVED'));

    await request(app.getHttpServer())
      .delete(`/projects/${projectId}`)
      .set(auth())
      .expect(204);

    const listAfterDelete = await request(app.getHttpServer())
      .get('/projects')
      .set(auth())
      .expect(200);
    expect(
      listAfterDelete.body.data.some((p: { id: string }) => p.id === projectId),
    ).toBe(false);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/restore`)
      .set(auth())
      .expect(201);

    const listAfterRestore = await request(app.getHttpServer())
      .get('/projects')
      .set(auth())
      .expect(200);
    expect(
      listAfterRestore.body.data.some(
        (p: { id: string }) => p.id === projectId,
      ),
    ).toBe(true);
  });

  it('favorites then unfavorites the project', async () => {
    const favorited = await request(app.getHttpServer())
      .post(`/projects/${projectId}/favorite`)
      .set(auth())
      .expect(201);
    expect(favorited.body.data.isFavorite).toBe(true);

    const listFavoritesOnly = await request(app.getHttpServer())
      .get('/projects?favoritesOnly=true')
      .set(auth())
      .expect(200);
    expect(
      listFavoritesOnly.body.data.some(
        (p: { id: string }) => p.id === projectId,
      ),
    ).toBe(true);

    const unfavorited = await request(app.getHttpServer())
      .delete(`/projects/${projectId}/favorite`)
      .set(auth())
      .expect(200);
    expect(unfavorited.body.data.isFavorite).toBe(false);
  });

  it('creates a tag and tags the project', async () => {
    const tag = await request(app.getHttpServer())
      .post('/tags')
      .set(auth())
      .send({ name: 'e2e-critical', color: '#FF0000' })
      .expect(201);
    tagId = tag.body.data.id;

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/tags/${tagId}`)
      .set(auth())
      .expect(201);

    const filtered = await request(app.getHttpServer())
      .get(`/projects?tagId=${tagId}`)
      .set(auth())
      .expect(200);
    expect(
      filtered.body.data.some((p: { id: string }) => p.id === projectId),
    ).toBe(true);
  });

  it('creates a target under the project, tags it, and lists/filters', async () => {
    const created = await request(app.getHttpServer())
      .post(`/projects/${projectId}/targets`)
      .set(auth())
      .send({
        type: 'DOMAIN',
        value: 'e2e.example.com',
        scopeStatus: 'IN_SCOPE',
      })
      .expect(201);
    targetId = created.body.data.id;

    await request(app.getHttpServer())
      .post(`/targets/${targetId}/tags/${tagId}`)
      .set(auth())
      .expect(201);

    const got = await request(app.getHttpServer())
      .get(`/targets/${targetId}`)
      .set(auth())
      .expect(200);
    expect(got.body.data.tags).toHaveLength(1);

    const filtered = await request(app.getHttpServer())
      .get(`/projects/${projectId}/targets?scopeStatus=IN_SCOPE`)
      .set(auth())
      .expect(200);
    expect(
      filtered.body.data.some((t: { id: string }) => t.id === targetId),
    ).toBe(true);
  });

  it('creates a note attached to the target, then updates it (auto-save path)', async () => {
    const created = await request(app.getHttpServer())
      .post(`/projects/${projectId}/notes`)
      .set(auth())
      .send({ title: 'Recon', content: '# Findings', targetId })
      .expect(201);
    noteId = created.body.data.id;
    expect(created.body.data.targetId).toBe(targetId);

    const updated = await request(app.getHttpServer())
      .patch(`/notes/${noteId}`)
      .set(auth())
      .send({ content: '# Findings\n\nUpdated.' })
      .expect(200);
    expect(updated.body.data.content).toContain('Updated.');
  });

  it('rejects a note with a targetId that does not exist (P2003 -> INVALID_REFERENCE)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/projects/${projectId}/notes`)
      .set(auth())
      .send({
        content: 'orphan',
        targetId: '00000000-0000-0000-0000-000000000000',
      })
      .expect(400);
    expect(res.body.code).toBe('INVALID_REFERENCE');
  });

  it('creates evidence, uploads an attachment, and confirms the checksum is computed', async () => {
    const created = await request(app.getHttpServer())
      .post(`/projects/${projectId}/evidence`)
      .set(auth())
      .send({ type: 'LOG', title: 'E2E scan log', textContent: 'port 22 open' })
      .expect(201);
    evidenceId = created.body.data.id;
    expect(created.body.data.checksum).toBeNull();

    await request(app.getHttpServer())
      .post(`/evidence/${evidenceId}/attachments`)
      .set(auth())
      .attach('file', Buffer.from('scan output'), 'scan.txt')
      .expect(201);

    const got = await request(app.getHttpServer())
      .get(`/evidence/${evidenceId}`)
      .set(auth())
      .expect(200);
    expect(got.body.data.checksum).toMatch(/^[a-f0-9]{64}$/);

    const attachments = await request(app.getHttpServer())
      .get(`/evidence/${evidenceId}/attachments`)
      .set(auth())
      .expect(200);
    expect(attachments.body.data).toHaveLength(1);
  });

  it('the activity timeline contains an entry for every write above', async () => {
    const res = await request(app.getHttpServer())
      .get(`/activity?projectId=${projectId}`)
      .set(auth())
      .expect(200);
    const verbs = res.body.data.map((e: { verb: string }) => e.verb);
    expect(verbs).toEqual(
      expect.arrayContaining([
        'project.created',
        'project.archived',
        'project.deleted',
        'project.restored',
        'project.favorited',
        'target.created',
        'note.created',
        'note.updated',
        'evidence.uploaded',
        'attachment.uploaded',
      ]),
    );
  });

  it('search finds the project, target, and evidence created above', async () => {
    const projectHit = await request(app.getHttpServer())
      .get('/search?q=E2E Project')
      .set(auth())
      .expect(200);
    expect(
      projectHit.body.data.some((r: { id: string }) => r.id === projectId),
    ).toBe(true);

    const targetHit = await request(app.getHttpServer())
      .get('/search?q=e2e.example.com')
      .set(auth())
      .expect(200);
    expect(
      targetHit.body.data.some((r: { id: string }) => r.id === targetId),
    ).toBe(true);

    const evidenceHit = await request(app.getHttpServer())
      .get('/search?q=scan log')
      .set(auth())
      .expect(200);
    expect(
      evidenceHit.body.data.some((r: { id: string }) => r.id === evidenceId),
    ).toBe(true);
  });

  it('rejects unauthenticated access to every new resource type', async () => {
    await request(app.getHttpServer()).get('/workspace').expect(401);
    await request(app.getHttpServer()).get('/projects').expect(401);
    await request(app.getHttpServer()).get(`/targets/${targetId}`).expect(401);
    await request(app.getHttpServer()).get(`/notes/${noteId}`).expect(401);
    await request(app.getHttpServer())
      .get(`/evidence/${evidenceId}`)
      .expect(401);
    await request(app.getHttpServer()).get('/activity').expect(401);
    await request(app.getHttpServer()).get('/search?q=x').expect(401);
  });

  it('PATCH /users/me/preferences persists theme/language/timezone', async () => {
    const updated = await request(app.getHttpServer())
      .patch('/users/me/preferences')
      .set(auth())
      .send({ theme: 'DARK', language: 'uz', timezone: 'Asia/Tashkent' })
      .expect(200);
    expect(updated.body.data.theme).toBe('DARK');

    const got = await request(app.getHttpServer())
      .get('/users/me/preferences')
      .set(auth())
      .expect(200);
    expect(got.body.data.theme).toBe('DARK');
    expect(got.body.data.timezone).toBe('Asia/Tashkent');
  });
});
