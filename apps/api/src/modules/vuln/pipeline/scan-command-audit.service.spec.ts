import { describe, expect, it, jest } from '@jest/globals';
import type { AuditService } from '../../audit/audit.service.js';
import { ScanCommandAudit } from './scan-command-audit.service.js';

const base = {
  userId: 'user-1',
  workspaceId: 'ws-1',
  jobId: 'job-1',
  target: { id: 't-1', value: 'shop.example.org' },
  tool: 'nuclei',
  stage: 'scan' as const,
  profile: 'QUICK',
  command: '/opt/secora-tools/bin/nuclei',
};

describe('ScanCommandAudit', () => {
  it('writes one SCAN_COMMAND_EXECUTED entry with who, what, where and the redacted argv', async () => {
    const auditService = { log: jest.fn(async () => undefined) } as unknown as jest.Mocked<AuditService>;
    await new ScanCommandAudit(auditService).record({
      ...base,
      argv: ['-u', 'https://93.184.216.34', '-H', 'Host: shop.example.org', '-H', 'Authorization: Bearer abcdefghijklmnop'],
    });

    expect(auditService.log).toHaveBeenCalledTimes(1);
    expect(auditService.log.mock.calls[0][0]).toMatchObject({
      userId: 'user-1',
      type: 'SCAN_COMMAND_EXECUTED',
      metadata: {
        workspaceId: 'ws-1',
        jobId: 'job-1',
        targetId: 't-1',
        targetValue: 'shop.example.org',
        tool: 'nuclei',
        stage: 'scan',
        profile: 'QUICK',
        binary: 'nuclei',
        argv: ['-u', 'https://93.184.216.34', '-H', 'Host: shop.example.org', '-H', 'Authorization: [REDACTED]'],
      },
    });
  });

  it('never stores a raw secret anywhere in the entry', async () => {
    const auditService = { log: jest.fn(async () => undefined) } as unknown as jest.Mocked<AuditService>;
    await new ScanCommandAudit(auditService).record({
      ...base,
      argv: ['-u', 'https://user:hunter2@shop.example.org/?token=abc123def', '-password', 'hunter2'],
    });
    const stored = JSON.stringify(auditService.log.mock.calls[0][0]);
    expect(stored).not.toContain('hunter2');
    expect(stored).not.toContain('abc123def');
  });

  it('does not throw when the audit write fails', async () => {
    const auditService = {
      log: jest.fn(async () => {
        throw new Error('db down');
      }),
    } as unknown as jest.Mocked<AuditService>;
    await expect(new ScanCommandAudit(auditService).record({ ...base, argv: ['-u', 'x'] })).resolves.toBeUndefined();
  });
});
