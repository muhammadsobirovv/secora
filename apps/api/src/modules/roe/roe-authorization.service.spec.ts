/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return -- in-memory stand-ins for Prisma delegates */
import { jest } from '@jest/globals';
import { ROE_LIMITS, type CreateRoeRequestDto } from '@pentesthub/shared';
import { RoeAuthorizationService } from './roe-authorization.service.js';
import { hashRoeToken, looksLikeRoeToken } from './roe-token.js';

/// A small in-memory stand-in for the three Prisma delegates the service uses,
/// with just the filter shapes it sends. It lets the single-use / expiry /
/// replay / rate-limit behaviour be tested against real state changes.

type Row = Record<string, any>;

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('gt' in cond) return value instanceof Date && value > cond.gt;
      if ('lt' in cond) return value instanceof Date && value < cond.lt;
      if ('in' in cond) return cond.in.includes(value);
    }
    return value === cond;
  });
}

function build() {
  const roes: Row[] = [];
  const events: Row[] = [];
  const mail: Array<{ to: string; subject: string; text: string; html?: string }> = [];
  const audits: Array<{ type: string; metadata?: Record<string, unknown> }> = [];
  const uploads: Array<{ key: string; type: string }> = [];
  let failMail = false;
  const withAssets = (row: Row | undefined) => (row ? { ...row } : null);

  const prisma = {
    roeAuthorization: {
      create: jest.fn(async ({ data }: { data: Row }) => {
        const { assets, ...rest } = data;
        const row = {
          createdAt: new Date(),
          updatedAt: new Date(),
          lastEmailAt: null,
          tokenUsedAt: null,
          revokeTokenHash: null,
          approvedAt: null,
          assets: assets.create.map((a: Row, i: number) => ({ id: `a${i}`, ...a })),
          ...rest,
        };
        roes.push(row);
        return { ...row };
      }),
      findUnique: jest.fn(async ({ where }: { where: Row }) => withAssets(roes.find((r) => matches(r, where)))),
      findFirst: jest.fn(async ({ where }: { where: Row }) => withAssets(roes.find((r) => matches(r, where)))),
      findMany: jest.fn(async ({ where }: { where: Row }) => roes.filter((r) => matches(r, where)).map((r) => ({ ...r }))),
      count: jest.fn(async ({ where }: { where: Row }) => roes.filter((r) => matches(r, where)).length),
      updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const hit = roes.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data, { updatedAt: new Date() }));
        return { count: hit.length };
      }),
    },
    roeEmailEvent: {
      count: jest.fn(async ({ where }: { where: Row }) => events.filter((e) => matches(e, where)).length),
      create: jest.fn(async ({ data }: { data: Row }) => {
        events.push({ createdAt: new Date(), ...data });
        return data;
      }),
    },
    user: {
      findUnique: jest.fn(async () => ({ email: 'dana@pentest-firm.io', displayName: 'Dana Tester' })),
    },
  };
  const service = new RoeAuthorizationService(
    prisma as never,
    { log: jest.fn(async (e: { type: string; metadata?: Record<string, unknown> }) => void audits.push(e)) } as never,
    {
      send: jest.fn(async (m: { to: string; subject: string; text: string; html?: string }) => {
        if (failMail) throw new Error('smtp down');
        mail.push(m);
      }),
    },
    {
      upload: jest.fn(async (key: string, _d: Buffer, type: string) => {
        uploads.push({ key, type });
        return { key, url: '' };
      }),
      download: jest.fn(async () => Buffer.from('%PDF-1.7 x')),
    } as never,
    { get: jest.fn(() => 'https://app.secora.group') } as never,
  );
  return { service, roes, events, mail, audits, uploads, setFailMail: (v: boolean) => void (failMail = v) };
}

const requester = { id: 'user-1', email: 'dana@pentest-firm.io', displayName: 'Dana Tester' };
const NOW = new Date('2026-10-23T10:00:00Z');
const dayMs = 86_400_000;

function request(overrides: Partial<CreateRoeRequestDto> = {}): CreateRoeRequestDto {
  return {
    clientName: 'Acme Ltd',
    clientEmail: 'ciso@acme.example',
    assets: [{ type: 'DOMAIN', value: 'acme.example', wildcard: false }],
    windowStart: new Date(NOW.getTime() + dayMs).toISOString(),
    windowEnd: new Date(NOW.getTime() + 8 * dayMs).toISOString(),
    signatoryName: 'Sam Signer',
    signatoryRole: 'CISO',
    responsibilityAccepted: true,
    ...overrides,
  };
}

function tokenFrom(mailText: string): string {
  const match = /\/roe\/(?:approve|revoke)\/(roe_[A-Za-z0-9_-]+)/.exec(mailText);
  if (!match) throw new Error('no link in mail');
  return match[1];
}

const create = (ctx: ReturnType<typeof build>, data = request(), now = NOW) =>
  ctx.service.create({ requester, workspaceId: 'ws-1', data, now });

describe('creating a request', () => {
  it('stores a hashed token, emails the client a link, and starts PENDING', async () => {
    const ctx = build();
    const dto = await create(ctx);
    expect(dto.status).toBe('PENDING');
    expect(ctx.mail).toHaveLength(1);
    const mail = ctx.mail[0];
    expect(mail.to).toBe('ciso@acme.example');
    const token = tokenFrom(mail.text);
    expect(looksLikeRoeToken(token)).toBe(true);
    // 256 bits of randomness in the link
    expect(Buffer.from(token.slice(4), 'base64url')).toHaveLength(32);
    expect(ctx.roes[0].tokenHash).toBe(hashRoeToken(token));
    expect(JSON.stringify(ctx.roes[0])).not.toContain(token);
    expect(ctx.roes[0].tokenExpiresAt.getTime() - NOW.getTime()).toBe(7 * dayMs);
    expect(ctx.audits.map((a) => a.type)).toEqual(['ROE_REQUESTED', 'ROE_EMAIL_SENT']);
    // the audit trail never holds the client's full address
    expect(JSON.stringify(ctx.audits)).not.toContain('ciso@acme.example');
  });

  it('rejects IP and CIDR assets with a clear message', async () => {
    for (const value of ['203.0.113.7', '203.0.113.0/24', '2001:db8::1']) {
      const ctx = build();
      await expect(create(ctx, request({ assets: [{ type: 'DOMAIN', value, wildcard: false }] }))).rejects.toMatchObject({
        code: 'ROE_IP_NOT_SUPPORTED',
      });
      expect(ctx.roes).toHaveLength(0);
      expect(ctx.mail).toHaveLength(0);
    }
  });

  it('enforces the email-domain rule, including the requester\'s own mailbox', async () => {
    const ctx = build();
    await expect(create(ctx, request({ clientEmail: 'boss@gmail.com' }))).rejects.toMatchObject({ code: 'ROE_EMAIL_BLOCKED' });
    await expect(create(ctx, request({ clientEmail: 'boss@other-company.example' }))).rejects.toMatchObject({
      code: 'ROE_EMAIL_DOMAIN_MISMATCH',
    });
    await expect(create(ctx, request({ clientEmail: 'dana@pentest-firm.io' }))).rejects.toMatchObject({
      code: expect.stringMatching(/ROE_EMAIL_(BLOCKED|DOMAIN_MISMATCH)/),
    });
    await expect(create(ctx, request({ clientEmail: 'x@mailinator.com' }))).rejects.toMatchObject({ code: 'ROE_EMAIL_BLOCKED' });
    expect(ctx.mail).toHaveLength(0);
  });

  it('requires the responsibility checkbox and caps the window at 90 days', async () => {
    const ctx = build();
    await expect(create(ctx, request({ responsibilityAccepted: false }))).rejects.toMatchObject({ code: 'ROE_INVALID_REQUEST' });
    await expect(
      create(ctx, request({ windowEnd: new Date(NOW.getTime() + 95 * dayMs).toISOString() })),
    ).rejects.toMatchObject({ code: 'ROE_INVALID_REQUEST' });
  });

  it('accepts evidence by its bytes, stores it under a random key and never trusts the name', async () => {
    const ctx = build();
    const dto = await ctx.service.create({
      requester,
      workspaceId: 'ws-1',
      data: request(),
      evidence: { buffer: Buffer.from('%PDF-1.4 signed'), originalname: '../../etc/evil.html' },
      now: NOW,
    });
    expect(dto.hasEvidence).toBe(true);
    expect(dto.evidenceName).toBe('evil.pdf');
    expect(ctx.uploads[0].type).toBe('application/pdf');
    expect(ctx.uploads[0].key).toMatch(/^roe\/[0-9a-f-]+\/[0-9a-f]{32}$/);
  });

  it('refuses evidence that is HTML/SVG dressed up as a PDF name', async () => {
    const ctx = build();
    for (const body of ['<html><script>alert(1)</script>', '<svg xmlns="http://www.w3.org/2000/svg"/>']) {
      await expect(
        ctx.service.create({
          requester,
          workspaceId: 'ws-1',
          data: request(),
          evidence: { buffer: Buffer.from(body), originalname: 'signed.pdf' },
          now: NOW,
        }),
      ).rejects.toMatchObject({ code: 'ROE_INVALID_EVIDENCE' });
    }
    expect(ctx.uploads).toHaveLength(0);
  });

  it('withdraws the request when the email cannot be sent', async () => {
    const ctx = build();
    ctx.setFailMail(true);
    await expect(create(ctx)).rejects.toMatchObject({ code: 'ROE_EMAIL_FAILED' });
    expect(ctx.roes[0].status).toBe('CANCELLED');
  });
});

describe('rate limits', () => {
  it('allows at most 5 pending requests per user', async () => {
    const ctx = build();
    for (let i = 0; i < ROE_LIMITS.maxPendingPerUser; i += 1) {
      await create(ctx, request({ clientEmail: `c${i}@acme.example` }));
    }
    await expect(create(ctx, request({ clientEmail: 'c9@acme.example' }))).rejects.toMatchObject({ code: 'ROE_TOO_MANY_PENDING' });
    // cancelling one frees a slot
    await ctx.service.cancel({ userId: requester.id, id: ctx.roes[0].id, now: NOW });
    await expect(create(ctx, request({ clientEmail: 'c9@acme.example' }))).resolves.toBeDefined();
  });

  it('allows at most 3 emails per recipient address per day', async () => {
    const ctx = build();
    const first = await create(ctx);
    for (let i = 0; i < 2; i += 1) {
      ctx.roes[0].lastEmailAt = new Date(NOW.getTime() - 11 * 60_000);
      await ctx.service.resend({ requester, id: first.id, now: NOW });
    }
    ctx.roes[0].lastEmailAt = new Date(NOW.getTime() - 11 * 60_000);
    await expect(ctx.service.resend({ requester, id: first.id, now: NOW })).rejects.toMatchObject({ code: 'ROE_RATE_LIMITED' });
    // a different request to the same address is limited too
    await expect(create(ctx, request())).rejects.toMatchObject({ code: 'ROE_RATE_LIMITED' });
  });

  it('allows at most 10 approval emails per user per hour', async () => {
    const ctx = build();
    for (let i = 0; i < ROE_LIMITS.maxEmailsPerUserPerHour; i += 1) {
      ctx.events.push({ userId: requester.id, recipient: `r${i}@acme.example`, createdAt: new Date(NOW.getTime() - 5 * 60_000), kind: 'APPROVAL' });
    }
    await expect(create(ctx)).rejects.toMatchObject({ code: 'ROE_RATE_LIMITED' });
  });

  it('enforces a 10 minute cooldown on resend and replaces the old link', async () => {
    const ctx = build();
    const dto = await create(ctx);
    const oldToken = tokenFrom(ctx.mail[0].text);
    await expect(ctx.service.resend({ requester, id: dto.id, now: new Date(NOW.getTime() + 5 * 60_000) })).rejects.toMatchObject({
      code: 'ROE_RESEND_COOLDOWN',
    });
    const later = new Date(NOW.getTime() + 11 * 60_000);
    await ctx.service.resend({ requester, id: dto.id, now: later });
    const newToken = tokenFrom(ctx.mail[1].text);
    expect(newToken).not.toBe(oldToken);
    await expect(ctx.service.approve(oldToken, {}, later)).rejects.toMatchObject({ code: 'ROE_LINK_INVALID' });
    await expect(ctx.service.approve(newToken, {}, later)).resolves.toBe('APPROVED');
  });
});

describe('the public approval link', () => {
  it('reading the page (GET) never changes anything', async () => {
    const ctx = build();
    await create(ctx);
    const token = tokenFrom(ctx.mail[0].text);
    for (let i = 0; i < 3; i += 1) {
      const view = await ctx.service.getForClient(token, NOW);
      expect(view.kind).toBe('APPROVAL');
      expect(view.clientName).toBe('Acme Ltd');
      expect(view.requesterEmail).toBe('dana@pentest-firm.io');
    }
    expect(ctx.roes[0].status).toBe('PENDING');
    expect(ctx.roes[0].tokenUsedAt).toBeNull();
    expect(ctx.audits.map((a) => a.type)).not.toContain('ROE_APPROVED');
  });

  it('approve activates once, records time/IP/UA, and mails the revoke link', async () => {
    const ctx = build();
    await create(ctx);
    const token = tokenFrom(ctx.mail[0].text);
    const when = new Date(NOW.getTime() + 3600_000);
    await expect(ctx.service.approve(token, { ipAddress: '198.51.100.4', userAgent: 'Mozilla/5.0' }, when)).resolves.toBe('APPROVED');
    expect(ctx.roes[0]).toMatchObject({ status: 'ACTIVE', approvedAt: when, approvedIp: '198.51.100.4', approvedUserAgent: 'Mozilla/5.0' });
    const confirmation = ctx.mail.find((m) => m.to === 'ciso@acme.example' && /withdraw/i.test(m.subject));
    expect(confirmation).toBeDefined();
    const revokeToken = tokenFrom(confirmation!.text);
    expect(ctx.roes[0].revokeTokenHash).toBe(hashRoeToken(revokeToken));
    expect(revokeToken).not.toBe(token);
    expect(ctx.mail.some((m) => m.to === 'dana@pentest-firm.io')).toBe(true);
  });

  it('is single use: replay of approve or decline gets the same neutral error', async () => {
    const ctx = build();
    await create(ctx);
    const token = tokenFrom(ctx.mail[0].text);
    await ctx.service.approve(token, {}, NOW);
    const replay = await ctx.service.approve(token, {}, NOW).catch((e) => e);
    const other = await ctx.service.decline(token, {}, NOW).catch((e) => e);
    const garbage = await ctx.service.approve('roe_' + 'A'.repeat(43), {}, NOW).catch((e) => e);
    for (const error of [replay, other, garbage]) {
      expect(error).toMatchObject({ code: 'ROE_LINK_INVALID' });
    }
    expect(replay.message).toBe(garbage.message);
    expect(ctx.roes[0].status).toBe('ACTIVE');
  });

  it('two simultaneous clicks produce exactly one decision', async () => {
    const ctx = build();
    await create(ctx);
    const token = tokenFrom(ctx.mail[0].text);
    const results = await Promise.allSettled([ctx.service.approve(token, {}, NOW), ctx.service.decline(token, {}, NOW)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('expires after 7 days', async () => {
    const ctx = build();
    const dto = await create(ctx);
    const token = tokenFrom(ctx.mail[0].text);
    const late = new Date(NOW.getTime() + 7 * dayMs + 1000);
    await expect(ctx.service.getForClient(token, late)).rejects.toMatchObject({ code: 'ROE_LINK_INVALID' });
    await expect(ctx.service.approve(token, {}, late)).rejects.toMatchObject({ code: 'ROE_LINK_INVALID' });
    expect((await ctx.service.get(requester.id, dto.id, late)).status).toBe('EXPIRED');
  });

  it('cannot be approved after the test window has ended', async () => {
    const ctx = build();
    await create(ctx, request({ windowEnd: new Date(NOW.getTime() + 2 * dayMs).toISOString() }));
    const token = tokenFrom(ctx.mail[0].text);
    await expect(ctx.service.approve(token, {}, new Date(NOW.getTime() + 3 * dayMs))).rejects.toMatchObject({ code: 'ROE_LINK_INVALID' });
  });

  it('decline ends the request and mails no revoke link', async () => {
    const ctx = build();
    await create(ctx);
    const token = tokenFrom(ctx.mail[0].text);
    await expect(ctx.service.decline(token, { ipAddress: '198.51.100.4' }, NOW)).resolves.toBe('DECLINED');
    expect(ctx.roes[0]).toMatchObject({ status: 'DECLINED', declinedIp: '198.51.100.4' });
    expect(ctx.roes[0].revokeTokenHash).toBeNull();
    expect(ctx.mail.some((m) => /\/roe\/revoke\//.test(m.text))).toBe(false);
  });

  it('revoke works once from the confirmation link and then stops the authorization', async () => {
    const ctx = build();
    await create(ctx);
    await ctx.service.approve(tokenFrom(ctx.mail[0].text), {}, NOW);
    const revokeToken = tokenFrom(ctx.mail.find((m) => /\/roe\/revoke\//.test(m.text))!.text);
    expect((await ctx.service.getForClient(revokeToken, NOW)).kind).toBe('REVOKE');
    await expect(ctx.service.revoke(revokeToken, { ipAddress: '198.51.100.9' }, NOW)).resolves.toBe('REVOKED');
    expect(ctx.roes[0]).toMatchObject({ status: 'REVOKED', revokedIp: '198.51.100.9' });
    await expect(ctx.service.revoke(revokeToken, {}, NOW)).rejects.toMatchObject({ code: 'ROE_LINK_INVALID' });
    // the approval link cannot revoke, and the revoke link cannot approve
    await expect(ctx.service.approve(revokeToken, {}, NOW)).rejects.toMatchObject({ code: 'ROE_LINK_INVALID' });
  });
});

describe('ownership of requests', () => {
  it('another user cannot see, resend, cancel or download someone else\'s request', async () => {
    const ctx = build();
    const dto = await create(ctx);
    const other = { id: 'user-2', email: 'eve@evil.example', displayName: 'Eve' };
    await expect(ctx.service.get(other.id, dto.id)).rejects.toMatchObject({ code: 'ROE_NOT_FOUND' });
    await expect(ctx.service.resend({ requester: other, id: dto.id, now: NOW })).rejects.toMatchObject({ code: 'ROE_NOT_FOUND' });
    await expect(ctx.service.cancel({ userId: other.id, id: dto.id, now: NOW })).rejects.toMatchObject({ code: 'ROE_NOT_FOUND' });
    await expect(ctx.service.evidence(other.id, dto.id)).rejects.toMatchObject({ code: 'ROE_NOT_FOUND' });
    expect(await ctx.service.list(other.id)).toEqual([]);
  });

  it('the requester can cancel a pending request and then its link is dead', async () => {
    const ctx = build();
    const dto = await create(ctx);
    const token = tokenFrom(ctx.mail[0].text);
    expect((await ctx.service.cancel({ userId: requester.id, id: dto.id, now: NOW })).status).toBe('CANCELLED');
    await expect(ctx.service.approve(token, {}, NOW)).rejects.toMatchObject({ code: 'ROE_LINK_INVALID' });
  });

  it('an active authorization reads EXPIRED once its window has ended', async () => {
    const ctx = build();
    const dto = await create(ctx);
    await ctx.service.approve(tokenFrom(ctx.mail[0].text), {}, NOW);
    const after = new Date(NOW.getTime() + 9 * dayMs);
    expect((await ctx.service.get(requester.id, dto.id, after)).status).toBe('EXPIRED');
  });
});
