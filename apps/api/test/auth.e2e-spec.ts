import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { generate } from 'otplib';
import { AppModule } from '../src/app.module.js';
import { configureApp, setupSwagger } from '../src/bootstrap.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { readLatestTokenForEmail } from './mail-outbox.helper.js';

/// Runs against the real local dev Postgres (see docs/modules/01-auth.md
/// "Local development database") — start it first with
/// `npx prisma dev --detach` and seed with `npx prisma db seed`.
/// Every test uses a unique email (timestamped) so runs don't collide with
/// each other or with prior manual/seeded data.
///
/// Each top-level describe block below bootstraps its own app instance
/// (via createAuthTestApp) rather than sharing one across the file. The
/// login/register routes are rate-limited at 5 req/60s per route; a fresh
/// app gets fresh in-memory ThrottlerStorage, so a block that deliberately
/// exhausts that budget (login lockout) doesn't poison the budget for
/// every other block's login calls.
async function createAuthTestApp(): Promise<{
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

  // Idempotent — mirrors prisma/seed.ts's upsert so this suite doesn't
  // depend on having been run first.
  await prisma.role.upsert({
    where: { name: 'USER' },
    update: {},
    create: { name: 'USER', description: 'Standard authenticated user' },
  });

  return { app, prisma };
}

function uniqueEmail(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

describe('Auth (e2e) — register -> verify -> login -> me', () => {
  let app: INestApplication;
  const email = uniqueEmail('full-flow');
  const password = 'correct-horse-battery-staple';

  beforeAll(async () => {
    ({ app } = await createAuthTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers without issuing tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, displayName: 'E2E User' })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user.emailVerified).toBe(false);
    expect(res.body.data.accessToken).toBeUndefined();
  });

  it('rejects a duplicate registration', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, displayName: 'E2E User' })
      .expect(409);

    expect(res.body.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('rejects malformed input via the global ValidationPipe', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'short', displayName: '' })
      .expect(400);
  });

  it('verifies the email using the token from the dev mail outbox', async () => {
    const token = await readLatestTokenForEmail(email);

    await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token })
      .expect(204);
  });

  let accessToken: string;
  let refreshToken: string;

  it('logs in after verification', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    expect(res.body.data.accessToken).toEqual(expect.any(String));
    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  it('rejects /auth/me without a token', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('returns the current user for a valid token', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data.email).toBe(email);
    expect(res.body.data.emailVerified).toBe(true);
  });

  it('lists the current session as current', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/sessions')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].current).toBe(true);
  });

  it('rotates the refresh token and detects reuse of the old one', async () => {
    const rotateRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(200);
    const newRefreshToken = rotateRes.body.data.refreshToken;
    expect(newRefreshToken).not.toBe(refreshToken);

    // Reusing the now-rotated old token is theft-shaped — the whole
    // session dies, including the token that was legitimately issued.
    const reuseRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(401);
    expect(reuseRes.body.code).toBe('INVALID_OR_EXPIRED_TOKEN');

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: newRefreshToken })
      .expect(401);
  });

  it('serves the OpenAPI document and excludes the OAuth redirect routes', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    const paths = Object.keys(res.body.paths);

    expect(paths).toContain('/auth/login');
    expect(paths).not.toContain('/auth/oauth/google');
  });
});

describe('Auth (e2e) — login lockout', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = uniqueEmail('lockout');
  const password = 'correct-horse-battery-staple';

  beforeAll(async () => {
    ({ app, prisma } = await createAuthTestApp());

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, displayName: 'Lockout User' })
      .expect(201);
    const token = await readLatestTokenForEmail(email);
    await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token })
      .expect(204);
  });

  afterAll(async () => {
    await app.close();
  });

  it('locks the account once the failed-attempt threshold is reached, even with the correct password after', async () => {
    // Arrange the "4 failed attempts already" state directly in the DB —
    // driving 5 real wrong-password HTTP calls here would collide with
    // this same route's 5-req/60s throttle before the lockout logic (a
    // separate, business-level concern) ever gets exercised. The 5th
    // attempt below is the real thing under test: a genuine HTTP call
    // through LoginUseCase's actual lockout branch.
    await prisma.user.update({
      where: { email },
      data: { failedLoginCount: 4 },
    });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(403);
    expect(res.body.code).toBe('ACCOUNT_LOCKED');
  });
});

describe('Auth (e2e) — MFA lifecycle', () => {
  let app: INestApplication;
  const email = uniqueEmail('mfa');
  const password = 'correct-horse-battery-staple';
  let accessToken: string;
  let secret: string;
  let backupCodes: string[];

  beforeAll(async () => {
    ({ app } = await createAuthTestApp());

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, displayName: 'MFA User' })
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

  it('sets up and confirms MFA, receiving backup codes', async () => {
    const setupRes = await request(app.getHttpServer())
      .post('/auth/mfa/setup')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    secret = setupRes.body.data.secret;

    const code = await generate({ secret });
    const confirmRes = await request(app.getHttpServer())
      .post('/auth/mfa/confirm')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code })
      .expect(201);
    backupCodes = confirmRes.body.data.backupCodes;
    expect(backupCodes).toHaveLength(10);
  });

  // One login call, not two — /auth/login is rate-limited at 5 req/60s and
  // this suite already spends part of that budget elsewhere in this block;
  // "requires a challenge" and "completes with TOTP" are naturally one
  // sequential flow through the same login response anyway.
  it('requires an MFA challenge to log in, then completes it with a valid TOTP code', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    expect(loginRes.body.data.mfaRequired).toBe(true);
    expect(loginRes.body.data.mfaChallengeToken).toEqual(expect.any(String));

    const code = await generate({ secret });
    const res = await request(app.getHttpServer())
      .post('/auth/mfa/challenge')
      .send({ mfaChallengeToken: loginRes.body.data.mfaChallengeToken, code })
      .expect(200);

    expect(res.body.data.accessToken).toEqual(expect.any(String));
  });

  it('completes login with a backup code, exactly once', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    const backupCode = backupCodes[0];

    await request(app.getHttpServer())
      .post('/auth/mfa/challenge')
      .send({
        mfaChallengeToken: loginRes.body.data.mfaChallengeToken,
        code: backupCode,
      })
      .expect(200);

    const secondLoginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    const res = await request(app.getHttpServer())
      .post('/auth/mfa/challenge')
      .send({
        mfaChallengeToken: secondLoginRes.body.data.mfaChallengeToken,
        code: backupCode,
      })
      .expect(401);
    expect(res.body.code).toBe('MFA_CODE_INVALID');
  });

  it('disables MFA with a valid code', async () => {
    const code = await generate({ secret });
    await request(app.getHttpServer())
      .post('/auth/mfa/disable')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code })
      .expect(204);

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
  });
});

describe('Auth (e2e) — rate limiting', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createAuthTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 429 after exceeding the login route's request budget", async () => {
    const email = uniqueEmail('throttle');
    let sawTooManyRequests = false;

    for (let i = 0; i < 8; i++) {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'irrelevant' });
      if (res.status === 429) {
        sawTooManyRequests = true;
        expect(res.body.code).toBe('RATE_LIMITED');
        break;
      }
    }

    expect(sawTooManyRequests).toBe(true);
  });
});
