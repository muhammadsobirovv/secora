import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AiPrivacyModeService } from './ai-privacy-mode.service.js';
import type { WorkspaceAiPrivacyRepository } from '../domain/repositories/workspace-ai-privacy.repository.interface.js';

/// Module 11 — Privacy controls (task #234) unit tests. Covers
/// AiPrivacyModeService.resolveMode/getSetting/setMode in isolation
/// against a mocked repository + ConfigService, since this is the single
/// place that decides "what AiPrivacyMode applies to this workspace right
/// now" — every downstream enforcement decision (AiProviderRegistryService)
/// depends on this being correct.
describe('AiPrivacyModeService', () => {
  let service: AiPrivacyModeService;
  let repository: jest.Mocked<WorkspaceAiPrivacyRepository>;
  let configService: { get: jest.Mock };

  beforeEach(() => {
    repository = {
      findByWorkspaceId: jest.fn(),
      upsert: jest.fn(),
    } as unknown as jest.Mocked<WorkspaceAiPrivacyRepository>;
    configService = { get: jest.fn().mockReturnValue('CLOUD') };
    service = new AiPrivacyModeService(configService as never, repository);
  });

  describe('resolveMode', () => {
    it('returns the workspace-level override when one exists', async () => {
      repository.findByWorkspaceId.mockResolvedValue({
        workspaceId: 'ws-1',
        mode: 'LOCAL',
        cloudUsageConfirmedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const mode = await service.resolveMode('ws-1');

      expect(mode).toBe('LOCAL');
      expect(configService.get).not.toHaveBeenCalled();
    });

    it('falls back to the AI_ORCHESTRATOR_MODE env default when no row exists', async () => {
      repository.findByWorkspaceId.mockResolvedValue(null);
      configService.get.mockReturnValue('HYBRID');

      const mode = await service.resolveMode('ws-2');

      expect(mode).toBe('HYBRID');
      expect(configService.get).toHaveBeenCalledWith('AI_ORCHESTRATOR_MODE', { infer: true });
    });
  });

  describe('getSetting', () => {
    it('maps a persisted row to the DTO shape', async () => {
      const updatedAt = new Date('2026-01-01T00:00:00.000Z');
      repository.findByWorkspaceId.mockResolvedValue({
        workspaceId: 'ws-1',
        mode: 'HYBRID',
        cloudUsageConfirmedAt: updatedAt,
        createdAt: updatedAt,
        updatedAt,
      });

      const dto = await service.getSetting('ws-1');

      expect(dto).toEqual({
        workspaceId: 'ws-1',
        mode: 'HYBRID',
        updatedAt: updatedAt.toISOString(),
        cloudUsageConfirmedAt: updatedAt.toISOString(),
      });
    });

    it('reports the effective env-default mode when no row exists yet', async () => {
      repository.findByWorkspaceId.mockResolvedValue(null);
      configService.get.mockReturnValue('CLOUD');

      const dto = await service.getSetting('ws-3');

      expect(dto.workspaceId).toBe('ws-3');
      expect(dto.mode).toBe('CLOUD');
      expect(dto.cloudUsageConfirmedAt).toBeNull();
    });
  });

  describe('setMode', () => {
    it('upserts and returns the resulting DTO for LOCAL mode without requiring confirmation', async () => {
      const updatedAt = new Date('2026-02-01T00:00:00.000Z');
      repository.upsert.mockResolvedValue({
        workspaceId: 'ws-1',
        mode: 'LOCAL',
        cloudUsageConfirmedAt: null,
        createdAt: updatedAt,
        updatedAt,
      });

      const dto = await service.setMode('ws-1', 'LOCAL');

      expect(repository.findByWorkspaceId).not.toHaveBeenCalled();
      expect(repository.upsert).toHaveBeenCalledWith('ws-1', 'LOCAL', false);
      expect(dto).toEqual({
        workspaceId: 'ws-1',
        mode: 'LOCAL',
        updatedAt: updatedAt.toISOString(),
        cloudUsageConfirmedAt: null,
      });
    });

    it('throws AI_CLOUD_USAGE_NOT_CONFIRMED for CLOUD mode when never confirmed and confirmCloudUsage is not passed', async () => {
      repository.findByWorkspaceId.mockResolvedValue(null);

      await expect(service.setMode('ws-1', 'CLOUD')).rejects.toMatchObject({
        code: 'AI_CLOUD_USAGE_NOT_CONFIRMED',
      });
      expect(repository.upsert).not.toHaveBeenCalled();
    });

    it('allows CLOUD mode when confirmCloudUsage: true is passed', async () => {
      const updatedAt = new Date('2026-02-01T00:00:00.000Z');
      repository.findByWorkspaceId.mockResolvedValue(null);
      repository.upsert.mockResolvedValue({
        workspaceId: 'ws-1',
        mode: 'CLOUD',
        cloudUsageConfirmedAt: updatedAt,
        createdAt: updatedAt,
        updatedAt,
      });

      const dto = await service.setMode('ws-1', 'CLOUD', true);

      expect(repository.upsert).toHaveBeenCalledWith('ws-1', 'CLOUD', true);
      expect(dto.cloudUsageConfirmedAt).toBe(updatedAt.toISOString());
    });

    it('allows HYBRID mode without re-confirming when already confirmed previously', async () => {
      const confirmedAt = new Date('2026-01-15T00:00:00.000Z');
      const updatedAt = new Date('2026-02-01T00:00:00.000Z');
      repository.findByWorkspaceId.mockResolvedValue({
        workspaceId: 'ws-1',
        mode: 'CLOUD',
        cloudUsageConfirmedAt: confirmedAt,
        createdAt: confirmedAt,
        updatedAt: confirmedAt,
      });
      repository.upsert.mockResolvedValue({
        workspaceId: 'ws-1',
        mode: 'HYBRID',
        cloudUsageConfirmedAt: confirmedAt,
        createdAt: confirmedAt,
        updatedAt,
      });

      const dto = await service.setMode('ws-1', 'HYBRID');

      expect(repository.upsert).toHaveBeenCalledWith('ws-1', 'HYBRID', false);
      expect(dto.cloudUsageConfirmedAt).toBe(confirmedAt.toISOString());
    });
  });
});
