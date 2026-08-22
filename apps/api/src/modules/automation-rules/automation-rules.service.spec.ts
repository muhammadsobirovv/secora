import { describe, expect, it, jest } from '@jest/globals';
import { AutomationRulesService } from './automation-rules.service.js';

/// Module 17 — task #496 (Tests: automation auth). Exercises the task
/// #492 security-review fix directly: `validateActionConfig` must reject
/// a `NOTIFY` action targeting a `userId` who isn't a member of the
/// rule's own workspace, and reject `CREATE_INCIDENT`/
/// `CREATE_REMEDIATION_TASK` targeting a `projectId` that doesn't belong
/// to the rule's own workspace — closing the arbitrary-target
/// IDOR/spam gap the review found. Hand-rolled Prisma mock, no live DB,
/// same idiom as the rest of this session's M17 specs.

function buildService() {
  const automationRuleCreate = jest.fn<(args: unknown) => Promise<Record<string, unknown>>>();
  const workspaceMemberFindFirst = jest.fn<(args: unknown) => Promise<Record<string, unknown> | null>>();
  const projectFindFirst = jest.fn<(args: unknown) => Promise<Record<string, unknown> | null>>();

  const prisma = {
    automationRule: { create: automationRuleCreate },
    workspaceMember: { findFirst: workspaceMemberFindFirst },
    project: { findFirst: projectFindFirst },
  } as unknown as ConstructorParameters<typeof AutomationRulesService>[0];

  // securityApproval/notificationDispatcher/incidents/remediation are
  // unused by create() — stubbed, not mocked, matching this session's
  // "only mock what the method under test actually calls" convention.
  const service = new AutomationRulesService(
    prisma,
    {} as ConstructorParameters<typeof AutomationRulesService>[1],
    {} as ConstructorParameters<typeof AutomationRulesService>[2],
    {} as ConstructorParameters<typeof AutomationRulesService>[3],
    {} as ConstructorParameters<typeof AutomationRulesService>[4],
  );
  return { service, automationRuleCreate, workspaceMemberFindFirst, projectFindFirst };
}

describe('AutomationRulesService.create — NOTIFY action ownership (task #492 fix)', () => {
  it('rejects a NOTIFY action targeting a userId who is not a member of this workspace', async () => {
    const { service, workspaceMemberFindFirst } = buildService();
    workspaceMemberFindFirst.mockResolvedValue(null); // not a member

    await expect(
      service.create('ws-mine', 'creator-1', {
        name: 'Notify on breach',
        triggerType: 'SLA_BREACH',
        triggerConfig: {},
        actionConfig: { kind: 'NOTIFY', userId: 'victim-in-another-workspace', title: 'You have been notified' },
      } as never),
    ).rejects.toMatchObject({ code: 'AUTOMATION_RULE_ACTION_INVALID' });
  });

  it('accepts a NOTIFY action targeting a real member of this workspace, and sets requiresApproval: false', async () => {
    const { service, workspaceMemberFindFirst, automationRuleCreate } = buildService();
    workspaceMemberFindFirst.mockResolvedValue({ id: 'member-1' });
    automationRuleCreate.mockImplementation(async (args: unknown) => {
      const a = args as { data: Record<string, unknown> };
      return { id: 'rule-1', createdAt: new Date(), updatedAt: new Date(), ...a.data };
    });

    const result = await service.create('ws-mine', 'creator-1', {
      name: 'Notify owner',
      triggerType: 'SLA_BREACH',
      triggerConfig: {},
      actionConfig: { kind: 'NOTIFY', userId: 'real-member', title: 'SLA breached' },
    } as never);

    expect(result.requiresApproval).toBe(false);
    expect(workspaceMemberFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'ws-mine', userId: 'real-member' }) }),
    );
  });
});

describe('AutomationRulesService.create — CREATE_INCIDENT/CREATE_REMEDIATION_TASK ownership (task #492 fix)', () => {
  it('rejects a CREATE_INCIDENT action targeting a projectId that does not belong to this workspace', async () => {
    const { service, projectFindFirst } = buildService();
    projectFindFirst.mockResolvedValue(null); // project.findFirst({id, workspaceId, deletedAt:null}) found nothing

    await expect(
      service.create('ws-mine', 'creator-1', {
        name: 'Auto-open incident on KEV match',
        triggerType: 'KEV_MATCH',
        triggerConfig: {},
        actionConfig: { kind: 'CREATE_INCIDENT', projectId: 'foreign-project', title: 'Auto incident', description: 'x', severity: 'HIGH' },
      } as never),
    ).rejects.toMatchObject({ code: 'AUTOMATION_RULE_ACTION_INVALID' });
  });

  it('accepts a CREATE_INCIDENT action targeting a projectId that does belong to this workspace, and sets requiresApproval: true', async () => {
    const { service, projectFindFirst, automationRuleCreate } = buildService();
    projectFindFirst.mockResolvedValue({ id: 'project-1' });
    automationRuleCreate.mockImplementation(async (args: unknown) => {
      const a = args as { data: Record<string, unknown> };
      return { id: 'rule-2', createdAt: new Date(), updatedAt: new Date(), ...a.data };
    });

    const result = await service.create('ws-mine', 'creator-1', {
      name: 'Auto-open incident on KEV match',
      triggerType: 'KEV_MATCH',
      triggerConfig: {},
      actionConfig: { kind: 'CREATE_INCIDENT', projectId: 'project-1', title: 'Auto incident', description: 'x', severity: 'HIGH' },
    } as never);

    expect(result.requiresApproval).toBe(true);
    expect(projectFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'project-1', workspaceId: 'ws-mine', deletedAt: null }) }),
    );
  });

  it('rejects a CREATE_REMEDIATION_TASK action targeting a projectId that does not belong to this workspace', async () => {
    const { service, projectFindFirst } = buildService();
    projectFindFirst.mockResolvedValue(null);

    await expect(
      service.create('ws-mine', 'creator-1', {
        name: 'Auto-open remediation on indicator match',
        triggerType: 'INDICATOR_MATCH',
        triggerConfig: {},
        actionConfig: { kind: 'CREATE_REMEDIATION_TASK', projectId: 'foreign-project', notes: 'x', priority: 'HIGH' },
      } as never),
    ).rejects.toMatchObject({ code: 'AUTOMATION_RULE_ACTION_INVALID' });
  });
});
