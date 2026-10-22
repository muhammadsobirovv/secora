import { describe, expect, it, jest } from '@jest/globals';
import type { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../prisma/prisma-transaction.types.js';
import { OwnershipScopeService } from './ownership-scope.service.js';

function service(row: { method: string | null; verifiedAt: Date | null } | null) {
  const findUnique = jest.fn(() => Promise.resolve(row));
  const txHost = {
    tx: { targetOwnershipVerification: { findUnique } },
  } as unknown as TransactionHost<AppTransactionalAdapter>;
  return { findUnique, service: new OwnershipScopeService(txHost) };
}

const verified = new Date('2026-10-01T00:00:00Z');

describe('OwnershipScopeService', () => {
  it('a DNS TXT proof on a DOMAIN target covers the apex and its subdomains', async () => {
    const { service: s, findUnique } = service({ method: 'DNS_TXT', verifiedAt: verified });
    expect(await s.ruleFor({ id: 't1', type: 'DOMAIN' }, 'Example.org')).toEqual({
      root: 'example.org',
      includeSubdomains: true,
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { targetId: 't1' },
      select: { method: true, verifiedAt: true },
    });
  });

  it.each(['HTTP_FILE', 'META_TAG'])('a %s proof covers only the verified host', async (method) => {
    const { service: s } = service({ method, verifiedAt: verified });
    expect(await s.ruleFor({ id: 't1', type: 'DOMAIN' }, 'example.org')).toEqual({
      root: 'example.org',
      includeSubdomains: false,
    });
  });

  it('a DNS TXT proof on a SUBDOMAIN or URL target does not reach other names', async () => {
    const { service: s } = service({ method: 'DNS_TXT', verifiedAt: verified });
    expect((await s.ruleFor({ id: 't1', type: 'SUBDOMAIN' }, 'shop.example.org')).includeSubdomains).toBe(false);
    expect((await s.ruleFor({ id: 't1', type: 'URL' }, 'shop.example.org')).includeSubdomains).toBe(false);
  });

  it('an unverified target, or one with no ownership row, gets the narrowest rule', async () => {
    const unverified = service({ method: 'DNS_TXT', verifiedAt: null });
    expect((await unverified.service.ruleFor({ id: 't1', type: 'DOMAIN' }, 'example.org')).includeSubdomains).toBe(false);
    const none = service(null);
    expect((await none.service.ruleFor({ id: 't1', type: 'DOMAIN' }, 'example.org')).includeSubdomains).toBe(false);
  });
});
