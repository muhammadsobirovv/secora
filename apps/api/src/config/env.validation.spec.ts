import { describe, expect, it } from '@jest/globals';
import { validateEnv } from './env.validation.js';

/// Module 18 — task #503 (Phase 1: Production Configuration). `validateEnv`
/// is the single fail-fast gate every apps/api process (API + worker) runs
/// through at boot (see app.module.ts / worker.module.ts's
/// `ConfigModule.forRoot({ validate: validateEnv })`) — despite being
/// foundational, it had zero direct test coverage before this task. These
/// tests cover the six categories Module 18 Phase 1 explicitly asks for:
/// missing required var, invalid URL, invalid numeric, invalid enum,
/// production-unsafe defaults, and valid configuration. No live process/DB
/// involved — `validateEnv` is a pure function over a plain object, so this
/// is a straightforward unit test, not an integration test.

/// The minimum set of variables that satisfies every *required* (no
/// `.optional()`/`.default()`) field in the schema — DATABASE_URL,
/// JWT_ACCESS_SECRET (>=32 chars), CREDENTIAL_ENCRYPTION_KEY (>=32 chars).
/// Every other field has a schema default and is intentionally omitted here
/// so the "valid configuration" tests also exercise the default-filling
/// path, not just an exhaustively-populated object.
function minimalValidEnv(): Record<string, string> {
  return {
    DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/pentesthub',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    CREDENTIAL_ENCRYPTION_KEY: 'b'.repeat(32),
  };
}

describe('validateEnv — valid configuration', () => {
  it('accepts the minimal required set and fills in every documented default', () => {
    const result = validateEnv(minimalValidEnv());

    expect(result.DATABASE_URL).toBe('postgres://postgres:postgres@localhost:5432/pentesthub');
    expect(result.NODE_ENV).toBe('development');
    expect(result.PORT).toBe(3000);
    expect(result.JWT_ACCESS_TTL).toBe('15m');
    expect(result.FRONTEND_URL).toBe('http://localhost:3001');
    expect(result.MAIL_PROVIDER).toBe('dev');
    expect(result.QUEUE_PROVIDER).toBe('memory');
    expect(result.STORAGE_PROVIDER).toBe('local');
    expect(result.PENTESTHUB_EDITION).toBe('community');
    expect(result.LOG_LEVEL).toBe('info');
    expect(result.LOG_FORMAT).toBe('json');
  });

  it('accepts a fully-populated production-style configuration', () => {
    const env = {
      ...minimalValidEnv(),
      NODE_ENV: 'production',
      PORT: '8080',
      FRONTEND_URL: 'https://app.example.com',
      MAIL_PROVIDER: 'smtp',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      QUEUE_PROVIDER: 'redis',
      REDIS_URL: 'redis://redis.internal:6379',
      STORAGE_PROVIDER: 's3',
      STORAGE_S3_BUCKET: 'pentesthub-prod',
      STORAGE_S3_REGION: 'us-east-1',
      PENTESTHUB_EDITION: 'enterprise',
      TRUST_PROXY_HOPS: '1',
      AI_DEFAULT_PROVIDER: 'ANTHROPIC',
      AI_ANTHROPIC_API_KEY: 'sk-test-key',
    };

    const result = validateEnv(env);
    expect(result.NODE_ENV).toBe('production');
    expect(result.PORT).toBe(8080);
    expect(result.SMTP_PORT).toBe(465);
    expect(result.SMTP_SECURE).toBe(true);
    expect(result.TRUST_PROXY_HOPS).toBe(1);
    expect(result.QUEUE_PROVIDER).toBe('redis');
    expect(result.STORAGE_PROVIDER).toBe('s3');
  });

  it('accepts a comma-separated CORS_ADDITIONAL_ORIGINS and leaves it unparsed (bootstrap.ts splits it)', () => {
    const env = {
      ...minimalValidEnv(),
      CORS_ADDITIONAL_ORIGINS: 'https://secora.group,https://www.secora.group',
    };

    const result = validateEnv(env);
    expect(result.CORS_ADDITIONAL_ORIGINS).toBe(
      'https://secora.group,https://www.secora.group',
    );
  });

  it('leaves CORS_ADDITIONAL_ORIGINS undefined when not set (single-domain deployments need no config)', () => {
    const result = validateEnv(minimalValidEnv());
    expect(result.CORS_ADDITIONAL_ORIGINS).toBeUndefined();
  });
});

describe('validateEnv — missing required variable', () => {
  it('throws when DATABASE_URL is missing', () => {
    const env = minimalValidEnv();
    delete (env as Record<string, string | undefined>).DATABASE_URL;

    expect(() => validateEnv(env)).toThrow(/DATABASE_URL/);
  });

  it('throws when JWT_ACCESS_SECRET is missing', () => {
    const env = minimalValidEnv();
    delete (env as Record<string, string | undefined>).JWT_ACCESS_SECRET;

    expect(() => validateEnv(env)).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('throws when CREDENTIAL_ENCRYPTION_KEY is missing', () => {
    const env = minimalValidEnv();
    delete (env as Record<string, string | undefined>).CREDENTIAL_ENCRYPTION_KEY;

    expect(() => validateEnv(env)).toThrow(/CREDENTIAL_ENCRYPTION_KEY/);
  });

  it('lists every missing/invalid field in a single error when several are wrong at once', () => {
    const env: Record<string, string> = {};

    try {
      validateEnv(env);
      throw new Error('expected validateEnv to throw');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('DATABASE_URL');
      expect(message).toContain('JWT_ACCESS_SECRET');
      expect(message).toContain('CREDENTIAL_ENCRYPTION_KEY');
      expect(message).toMatch(/Invalid environment configuration/);
    }
  });
});

describe('validateEnv — invalid URL', () => {
  it('rejects a non-URL FRONTEND_URL', () => {
    const env = { ...minimalValidEnv(), FRONTEND_URL: 'not-a-url' };
    expect(() => validateEnv(env)).toThrow(/FRONTEND_URL/);
  });

  it('rejects a non-URL GOOGLE_CALLBACK_URL when the OAuth strategy is otherwise being configured', () => {
    const env = {
      ...minimalValidEnv(),
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'client-secret',
      GOOGLE_CALLBACK_URL: 'localhost:3000/callback', // missing scheme -> not a valid URL
    };
    expect(() => validateEnv(env)).toThrow(/GOOGLE_CALLBACK_URL/);
  });

  it('rejects a non-URL STORAGE_S3_ENDPOINT', () => {
    const env = { ...minimalValidEnv(), STORAGE_S3_ENDPOINT: 'minio.internal:9000' };
    expect(() => validateEnv(env)).toThrow(/STORAGE_S3_ENDPOINT/);
  });
});

describe('validateEnv — invalid numeric value', () => {
  it('rejects a non-numeric PORT', () => {
    const env = { ...minimalValidEnv(), PORT: 'not-a-number' };
    expect(() => validateEnv(env)).toThrow(/PORT/);
  });

  it('rejects a zero/non-positive PORT', () => {
    const env = { ...minimalValidEnv(), PORT: '0' };
    expect(() => validateEnv(env)).toThrow(/PORT/);
  });

  it('rejects a negative DATABASE_POOL_MAX', () => {
    const env = { ...minimalValidEnv(), DATABASE_POOL_MAX: '-5' };
    expect(() => validateEnv(env)).toThrow(/DATABASE_POOL_MAX/);
  });

  it('rejects a negative TRUST_PROXY_HOPS (min(0) — 0 is valid, negative is not)', () => {
    const env = { ...minimalValidEnv(), TRUST_PROXY_HOPS: '-1' };
    expect(() => validateEnv(env)).toThrow(/TRUST_PROXY_HOPS/);
  });

  it('rejects a BUGBOUNTY_DUPLICATE_SIMILARITY_THRESHOLD outside its 0-1 range', () => {
    const env = { ...minimalValidEnv(), BUGBOUNTY_DUPLICATE_SIMILARITY_THRESHOLD: '1.5' };
    expect(() => validateEnv(env)).toThrow(/BUGBOUNTY_DUPLICATE_SIMILARITY_THRESHOLD/);
  });
});

describe('validateEnv — invalid enum', () => {
  it('rejects an unrecognized NODE_ENV', () => {
    const env = { ...minimalValidEnv(), NODE_ENV: 'staging' };
    expect(() => validateEnv(env)).toThrow(/NODE_ENV/);
  });

  it('rejects an unrecognized QUEUE_PROVIDER', () => {
    const env = { ...minimalValidEnv(), QUEUE_PROVIDER: 'rabbitmq' };
    expect(() => validateEnv(env)).toThrow(/QUEUE_PROVIDER/);
  });

  it('rejects an unrecognized AI_DEFAULT_PROVIDER', () => {
    const env = { ...minimalValidEnv(), AI_DEFAULT_PROVIDER: 'CHATGPT' };
    expect(() => validateEnv(env)).toThrow(/AI_DEFAULT_PROVIDER/);
  });

  it('rejects an unrecognized LOG_LEVEL', () => {
    const env = { ...minimalValidEnv(), LOG_LEVEL: 'verbose' };
    expect(() => validateEnv(env)).toThrow(/LOG_LEVEL/);
  });

  it('rejects an unrecognized PENTESTHUB_EDITION', () => {
    const env = { ...minimalValidEnv(), PENTESTHUB_EDITION: 'pro' };
    expect(() => validateEnv(env)).toThrow(/PENTESTHUB_EDITION/);
  });
});

describe('validateEnv — production-unsafe defaults / weak secrets', () => {
  it('rejects a JWT_ACCESS_SECRET shorter than 32 characters, regardless of NODE_ENV', () => {
    const env = { ...minimalValidEnv(), JWT_ACCESS_SECRET: 'too-short-secret' };
    expect(() => validateEnv(env)).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects a CREDENTIAL_ENCRYPTION_KEY shorter than 32 characters', () => {
    const env = { ...minimalValidEnv(), CREDENTIAL_ENCRYPTION_KEY: 'short' };
    expect(() => validateEnv(env)).toThrow(/CREDENTIAL_ENCRYPTION_KEY/);
  });

  it('rejects an empty-string DATABASE_URL rather than silently treating it as unset', () => {
    const env = { ...minimalValidEnv(), DATABASE_URL: '' };
    expect(() => validateEnv(env)).toThrow(/DATABASE_URL/);
  });

  it('rejects a BACKUP_ENCRYPTION_KEY shorter than 32 characters when one is supplied', () => {
    const env = { ...minimalValidEnv(), BACKUP_ENCRYPTION_KEY: 'weak' };
    expect(() => validateEnv(env)).toThrow(/BACKUP_ENCRYPTION_KEY/);
  });

  it('rejects a BILLING_WEBHOOK_SECRET shorter than 16 characters when one is supplied', () => {
    const env = { ...minimalValidEnv(), BILLING_WEBHOOK_SECRET: 'short-secret' };
    expect(() => validateEnv(env)).toThrow(/BILLING_WEBHOOK_SECRET/);
  });

  it(
    'does NOT itself forbid NODE_ENV=production with an otherwise-default (non-secret) config — ' +
      'documenting a real, disclosed gap: the schema has no cross-field rule today that blocks, e.g., ' +
      'MAIL_PROVIDER=dev or QUEUE_PROVIDER=memory when NODE_ENV=production. Those are legitimate ' +
      'configurations for a single-container Community Edition deployment, so this is not being "fixed" ' +
      'as a bug — it is recorded here so the gap is explicit rather than silently assumed away.',
    () => {
      const env = { ...minimalValidEnv(), NODE_ENV: 'production' };
      expect(() => validateEnv(env)).not.toThrow();
    },
  );
});

describe('validateEnv — never logs secret values on failure', () => {
  it('omits the actual (invalid) value from the thrown error message, only the field path + reason', () => {
    const secretValue = 'super-secret-value-that-must-not-leak-into-logs';
    const env = { ...minimalValidEnv(), JWT_ACCESS_SECRET: secretValue.slice(0, 10) }; // deliberately too short

    try {
      validateEnv(env);
      throw new Error('expected validateEnv to throw');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('JWT_ACCESS_SECRET');
      expect(message).not.toContain(secretValue.slice(0, 10));
    }
  });
});

describe('validateEnv — production refuses private-target active scans', () => {
  it('fails startup when ACTIVE_SCAN_ALLOW_PRIVATE_TARGETS=true in production', () => {
    const env = {
      ...minimalValidEnv(),
      NODE_ENV: 'production',
      ACTIVE_SCAN_ALLOW_PRIVATE_TARGETS: 'true',
    };
    expect(() => validateEnv(env)).toThrow(/ACTIVE_SCAN_ALLOW_PRIVATE_TARGETS/);
  });

  it('allows the flag to be true outside production (self-hosted lab use)', () => {
    const env = {
      ...minimalValidEnv(),
      NODE_ENV: 'development',
      ACTIVE_SCAN_ALLOW_PRIVATE_TARGETS: 'true',
    };
    expect(validateEnv(env).ACTIVE_SCAN_ALLOW_PRIVATE_TARGETS).toBe(true);
  });

  it('keeps the production default (false) when the flag is unset', () => {
    const env = { ...minimalValidEnv(), NODE_ENV: 'production' };
    expect(validateEnv(env).ACTIVE_SCAN_ALLOW_PRIVATE_TARGETS).toBe(false);
  });
});
