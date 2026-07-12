import { z } from 'zod';

/// Fails fast at boot if a required secret/config value is missing or
/// malformed, instead of surfacing as a confusing runtime error later.
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  JWT_REFRESH_TTL_REMEMBER_ME: z.string().default('30d'),

  FRONTEND_URL: z.string().url().default('http://localhost:3001'),
  MAIL_FROM: z.string().default('PentestHub AI <no-reply@pentesthub.local>'),

  ACCOUNT_LOCKOUT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  ACCOUNT_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),

  // Number of reverse-proxy hops in front of this app (nginx, ALB,
  // Cloudflare, ...). 0 (default) means "no proxy — trust req.ip as-is",
  // correct for local dev. Set to the exact hop count in any proxied
  // deployment so Express's `trust proxy` reads the real client IP from
  // X-Forwarded-For at the right position instead of either trusting the
  // proxy's own IP (0) or blindly trusting a spoofable client-supplied
  // header (a bare `true`). Every audit-logged IP and every throttle-guard
  // IP-based counter depends on this being set correctly.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),

  // OAuth is optional — this environment has no live provider credentials.
  // Strategies register conditionally based on which of these are present.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_CALLBACK_URL: z.string().url().optional(),

  // Recon worker (Module 3) — see docs/adr/0003-recon-engine-module.md
  RECON_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(3),
  RECON_WORKER_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(2000),
  RECON_JOB_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(600),
  RECON_JOB_MAX_RETRIES: z.coerce.number().int().nonnegative().default(2),
  RECON_JOB_RETRY_BASE_DELAY_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5000),
  RECON_JOB_RETRY_MAX_DELAY_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(120000),
  RECON_JOB_LOG_SSE_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(1000),
  RECON_WORKER_ORPHAN_SWEEP_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60000),

  // Tool binary names — configurable so an environment-specific PATH
  // collision (e.g. Kali's `httpx` resolving to Python's HTTP client, not
  // ProjectDiscovery's recon tool) is a config change, not a code change.
  RECON_TOOL_BIN_NMAP: z.string().default('nmap'),
  RECON_TOOL_BIN_SUBFINDER: z.string().default('subfinder'),
  RECON_TOOL_BIN_HTTPX: z.string().default('httpx-toolkit'),
  RECON_TOOL_BIN_DNSX: z.string().default('dnsx'),
  RECON_TOOL_BIN_NAABU: z.string().default('naabu'),
  RECON_TOOL_BIN_WHATWEB: z.string().default('whatweb'),
  RECON_TOOL_BIN_ASSETFINDER: z.string().default('assetfinder'),
  RECON_TOOL_BIN_GOWITNESS: z.string().default('gowitness'),
  RECON_TOOL_BIN_AMASS: z.string().default('amass'),
  RECON_TOOL_BIN_KATANA: z.string().default('katana'),
  RECON_TOOL_BIN_GAU: z.string().default('gau'),
  RECON_TOOL_BIN_WAYBACKURLS: z.string().default('waybackurls'),
  RECON_TOOL_BIN_WHOIS: z.string().default('whois'),
  // ASN lookup reuses the same `whois` binary against Team Cymru's
  // whois-based bulk ASN lookup service (plain WHOIS protocol, no API key)
  // — s