import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp, setupSwagger } from '../src/bootstrap.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { readLatestTokenForEmail } from './mail-outbox.helper.js';

/// AI Security Copilot e2e coverage (Module 5, Phase 1). Deliberately
/// scoped to conversation lifecycle + the workspace-isolation guarantee
/// ("never allow one workspace to access another workspace's data") —
/// actual token streaming/tool-calling against a real LLM provider is
/// covered at the unit level (ai-chat.service.spec.ts) since no provider
/// API keys are configured in CI (AI Provider Architecture: Phase 1 ships
/// the abstraction, keys are wired later per the agreed phasing).
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
  return `e2e-ai-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

async function registerAndLogin(
  app: INestApplication,
  label: string,
): Promise<{ email: string; accessToken: string }> {
  const email = uniqueEmail(label);
  const password = 'correct-horse-battery-staple';
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password, displayName: `AI E2E ${label}` })
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
  return { email, accessToken: loginRes.body.data.accessToken as string };
}

describe('AI Security Copilot (e2e)', () => {
  let app: INestApplication;
  let myToken: string;
  let otherToken: string;
  let projectId: string;
  let conversationId: string;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    ({ accessToken: myToken } = await registerAndLogin(app, 'main'));
    ({ accessToken: otherToken } = await registerAndLogin(app, 'other'));

    const project = await request(app.getHttpServer())
      .post('/projects')
      .set(authHeader(myToken))
      .send({ name: 'AI E2E Project' })
      .expect(201);
    projectId = project.body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  function authHeader(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('lists providers with their configured status, without ever throwing for missing keys', async () => {
    const res = await request(app.getHttpServer())
      .get('/ai/providers')
      .set(authHeader(myToken))
      .expect(200);

    const names = res.body.data.map((p: { provider: string }) => p.provider);
    expect(names).toEqual(
      expect.arrayContaining([
        'OPENAI',
        'ANTHROPIC',
        'GEMINI',
        'OLLAMA',
        'OPENROUTER',
      ]),
    );
    for (const status of res.body.data) {
      expect(typeof status.configured).toBe('boolean');
    }
  });

  it('creates a conversation scoped to the caller workspace and project', async () => {
    const created = await request(app.getHttpServer())
      .post('/ai/conversations')
      .set(authHeader(myToken))
      .send({ projectId, title: 'E2E conversation' })
      .expect(201);

    conversationId = created.body.data.id;
    expect(created.body.data.projectId).toBe(projectId);
    expect(created.body.data.pinned).toBe(false);
    expect(created.body.data.messageCount).toBe(0);
  });

  it('lists the conversation back for the owning user', async () => {
    const res = await request(app.getHttpServer())
      .get(`/ai/conversations?projectId=${projectId}`)
      .set(authHeader(myToken))
      .expect(200);

    expect(
      res.body.data.some((c: { id: string }) => c.id === conversationId),
    ).toBe(true);
  });

  it('fetches the conversation with its (empty) message history', async () => {
    const res = await request(app.getHttpServer())
      .get(`/ai/conversations/${conversationId}`)
      .set(authHeader(myToken))
      .expect(200);

    expect(res.body.data.id).toBe(conversationId);
    expect(res.body.data.messages).toEqual([]);
  });

  it('pins the conversation', async () => {
    const res = await request(app.getHttpServer())
      .post(`/ai/conversations/${conversationId}/pin`)
      .set(authHeader(myToken))
      .send({ value: true })
      .expect(201);

    expect(res.body.data.pinned).toBe(true);
  });

  it('never lets another workspace see or touch this conversation (Workspace Isolation)', async () => {
    await request(app.getHttpServer())
      .get(`/ai/conversations/${conversationId}`)
      .set(authHeader(otherToken))
      .expect(404);

    await request(app.getHttpServer())
      .post(`/ai/conversations/${conversationId}/pin`)
      .set(authHeader(otherToken))
      .send({ value: true })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/ai/conversations/${conversationId}`)
      .set(authHeader(otherToken))
      .expect(404);

    // And the other user's own conversation list must never include it.
    const otherList = await request(app.getHttpServer())
      .get('/ai/conversations')
      .set(authHeader(otherToken))
      .expect(200);
    expect(
      otherList.body.data.some((c: { id: string }) => c.id === conversationId),
    ).toBe(false);
  });

  it('rejects creating a conversation against a project the caller cannot see', async () => {
    await request(app.getHttpServer())
      .post('/ai/conversations')
      .set(authHeader(otherToken))
      .send({ projectId, title: 'Should be rejected' })
      .expect(404);
  });

  it('deletes the conversation for its owner', async () => {
    await request(app.getHttpServer())
      .delete(`/ai/conversations/${conversationId}`)
      .set(authHeader(myToken))
      .expect(200);

    await request(app.getHttpServer())
      .get(`/ai/conversations/${conversationId}`)
      .set(authHeader(myToken))
      .expect(404);
  });
});
