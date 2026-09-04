import { describe, expect, it, jest } from '@jest/globals';
import { HealthController } from './health.controller.js';

/// Module 18 — task #507 (Health/readiness/liveness/version endpoints).
/// `HealthController` had no test coverage before this task. Hand-rolled
/// mocks for PrismaService/ConfigService/QueueService/StorageService — no
/// live DB/Redis/S3, same idiom established across every other repository/
/// controller spec in this codebase.

function buildController(opts: {
  dbOk?: boolean;
  queueProvider?: 'memory' | 'redis';
  storageProvider?: 'local' | 's3';
  queueStatsOk?: boolean;
  storageExistsOk?: boolean;
}) {
  const {
    dbOk = true,
    queueProvider = 'memory',
    storageProvider = 'local',
    queueStatsOk = true,
    storageExistsOk = true,
  } = opts;

  const prisma = {
    $queryRaw: jest.fn(async () => {
      if (!dbOk) throw new Error('connection refused');
      return [{ '?column?': 1 }];
    }),
  } as unknown as ConstructorParameters<typeof HealthController>[0];

  const configValues: Record<string, unknown> = {
    RELEASE_CHANNEL: 'stable',
    QUEUE_PROVIDER: queueProvider,
    STORAGE_PROVIDER: storageProvider,
  };
  const configService = {
    get: jest.fn((key: string) => configValues[key]),
  } as unknown as ConstructorParameters<typeof HealthController>[1];

  const queue = {
    stats: jest.fn(async () => {
      if (!queueStatsOk) throw new Error('ECONNREFUSED');
      return [];
    }),
  } as unknown as ConstructorParameters<typeof HealthController>[2];

  const storage = {
    exists: jest.fn(async () => {
      if (!storageExistsOk) throw new Error('AccessDenied');
      return false;
    }),
  } as unknown as ConstructorParameters<typeof HealthController>[3];

  const controller = new HealthController(prisma, configService, queue, storage);
  return { controller, prisma, queue, storage };
}

function buildResSpy() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { res: { status } as unknown as Parameters<HealthController['readiness']>[0], status, json };
}

describe('HealthController.liveness / live', () => {
  it('never touches the database and always returns status ok', () => {
    const { controller, prisma } = buildController({});

    const result = controller.liveness();

    expect(result.status).toBe('ok');
    expect(typeof result.uptimeSeconds).toBe('number');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('live() is byte-for-byte the same shape as liveness() (spec-required GET /health/live alias)', () => {
    const { controller } = buildController({});

    const a = controller.liveness();
    const b = controller.live();

    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    expect(b.status).toBe('ok');
  });
});

describe('HealthController.readiness', () => {
  it('returns 200 with database: ok when the database is reachable and no network-backed provider is configured', async () => {
    const { controller } = buildController({ dbOk: true, queueProvider: 'memory', storageProvider: 'local' });
    const { res, status, json } = buildResSpy();

    await controller.readiness(res);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      status: 'ok',
      checks: { database: 'ok', queue: 'skipped', storage: 'skipped' },
    });
  });

  it('returns 503 when the database is unreachable', async () => {
    const { controller } = buildController({ dbOk: false });
    const { res, status, json } = buildResSpy();

    await controller.readiness(res);

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ status: 'unavailable', checks: expect.objectContaining({ database: 'failed' }) }));
  });

  it('checks the queue only when QUEUE_PROVIDER=redis, and fails readiness when it is unreachable', async () => {
    const { controller, queue } = buildController({ queueProvider: 'redis', queueStatsOk: false });
    const { res, status, json } = buildResSpy();

    await controller.readiness(res);

    expect(queue.stats).toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ checks: expect.objectContaining({ queue: 'failed' }) }));
  });

  it('checks storage only when STORAGE_PROVIDER=s3, and fails readiness when it is unreachable', async () => {
    const { controller, storage } = buildController({ storageProvider: 's3', storageExistsOk: false });
    const { res, status, json } = buildResSpy();

    await controller.readiness(res);

    expect(storage.exists).toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ checks: expect.objectContaining({ storage: 'failed' }) }));
  });

  it('never calls queue.stats()/storage.exists() at all when their providers are the Community Edition defaults (optional providers must not block readiness)', async () => {
    const { controller, queue, storage } = buildController({ queueProvider: 'memory', storageProvider: 'local' });
    const { res } = buildResSpy();

    await controller.readiness(res);

    expect(queue.stats).not.toHaveBeenCalled();
    expect(storage.exists).not.toHaveBeenCalled();
  });

  it('reports 200 ok when database, queue, and storage are all configured and all reachable', async () => {
    const { controller } = buildController({
      dbOk: true,
      queueProvider: 'redis',
      storageProvider: 's3',
      queueStatsOk: true,
      storageExistsOk: true,
    });
    const { res, status, json } = buildResSpy();

    await controller.readiness(res);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      status: 'ok',
      checks: { database: 'ok', queue: 'ok', storage: 'ok' },
    });
  });
});

describe('HealthController.version', () => {
  it('returns version/environment always, and null for gitCommit/buildTimestamp when unset', () => {
    const { controller } = buildController({});
    delete process.env.GIT_COMMIT;
    delete process.env.BUILD_TIMESTAMP;

    const result = controller.version();

    expect(typeof result.version).toBe('string');
    expect(typeof result.environment).toBe('string');
    expect(result.gitCommit).toBeNull();
    expect(result.buildTimestamp).toBeNull();
  });

  it('surfaces GIT_COMMIT/BUILD_TIMESTAMP when a deployment sets them', () => {
    const { controller } = buildController({});
    process.env.GIT_COMMIT = 'abc1234';
    process.env.BUILD_TIMESTAMP = '2026-09-02T00:00:00.000Z';

    const result = controller.version();

    expect(result.gitCommit).toBe('abc1234');
    expect(result.buildTimestamp).toBe('2026-09-02T00:00:00.000Z');

    delete process.env.GIT_COMMIT;
    delete process.env.BUILD_TIMESTAMP;
  });
});
