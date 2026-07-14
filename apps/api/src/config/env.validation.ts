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
  // — see asn.tool-runner.ts. Configurable in case an environment needs a
  // different ASN-lookup WHOIS host.
  RECON_TOOL_ASN_WHOIS_HOST: z.string().default('whois.cymru.com'),

  // Vulnerability worker (Module 4) — see
  // docs/adr/0004-vulnerability-engine-module.md. Mirrors the RECON_WORKER_*
  // keys above field-for-field, plus heartbeat (Job System: Worker
  // Heartbeat / Dead Worker Recovery), which Module 3 didn't need.
  VULN_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  VULN_WORKER_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(2000),
  VULN_JOB_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(1800),
  VULN_JOB_MAX_RETRIES: z.coerce.number().int().nonnegative().default(2),
  VULN_JOB_RETRY_BASE_DELAY_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5000),
  VULN_JOB_RETRY_MAX_DELAY_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(120000),
  VULN_JOB_LOG_SSE_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(1000),
  // A RUNNING job whose lastHeartbeatAt is older than now - this interval is
  // considered orphaned (its worker died mid-job) — see
  // VulnScanJobPollerService.sweepOrphans. Must be comfortably larger than
  // VULN_WORKER_HEARTBEAT_INTERVAL_MS so one or two missed beats (a slow GC
  // pause, a busy event loop) don't false-positive a live worker as dead.
  VULN_WORKER_HEARTBEAT_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15000),
  VULN_WORKER_HEARTBEAT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60000),

  // Tool binary names — same rationale as RECON_TOOL_BIN_* above.
  VULN_TOOL_BIN_NUCLEI: z.string().default('nuclei'),
  VULN_TOOL_BIN_FFUF: z.string().default('ffuf'),
  VULN_TOOL_BIN_DIRSEARCH: z.string().default('dirsearch'),
  VULN_TOOL_BIN_FEROXBUSTER: z.string().default('feroxbuster'),
  VULN_TOOL_BIN_NIKTO: z.string().default('nikto'),

  // Wordlist paths for the two content-discovery fuzzers that need one
  // supplied explicitly (dirsearch and feroxbuster both ship/select a
  // reasonable default internally when none is given). Defaults match the
  // common SecLists install path on Kali; override per-environment.
  VULN_TOOL_WORDLIST_FFUF: z
    .string()
    .default('/usr/share/seclists/Discovery/Web-Content/common.txt'),

  // AI Security Copilot (Module 5) — see
  // docs/adr/0005-ai-security-copilot-module.md. Every provider key is
  // optional by design (AI Provider Architecture: "changing providers must
  // only require configuration") — the app boots and the provider registry
  // reports each provider's `configured` status via GET /ai/providers
  // without any of these being set; only actually *sending* a message
  // through an unconfigured provider fails, with a clear error, not boot.
  AI_DEFAULT_PROVIDER: z
    .enum(['OPENAI', 'ANTHROPIC', 'GEMINI', 'OLLAMA', 'OPENROUTER'])
    .default('ANTHROPIC'),

  AI_OPENAI_API_KEY: z.string().optional(),
  AI_OPENAI_MODEL: z.string().default('gpt-4o'),
  AI_OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),

  AI_ANTHROPIC_API_KEY: z.string().optional(),
  AI_ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-5'),

  AI_GEMINI_API_KEY: z.string().optional(),
  AI_GEMINI_MODEL: z.string().default('gemini-2.5-pro'),

  // Ollama is local — no API key, just a reachable base URL. `optional()`
  // (rather than a hardcoded default) so "is Ollama configured" can mean
  // "the operator deliberately pointed us at a local server", not "every
  // install silently tries localhost:11434 and fails weirdly".
  AI_OLLAMA_BASE_URL: z.string().url().optional(),
  AI_OLLAMA_MODEL: z.string().default('llama3.1'),

  AI_OPENROUTER_API_KEY: z.string().optional(),
  AI_OPENROUTER_MODEL: z.string().default('anthropic/claude-sonnet-4.5'),

  // RAG (Retrieval-Augmented Generation) tuning. Embedding dimension must
  // match the `vector(1536)` column width in the ai_memory_chunks table
  // (schema.prisma) — 1536 is OpenAI's text-embedding-3-small width, the
  // one embedding model every provider path can fall back to structurally
  // in Phase 1. Changing embedding models to a different dimension count
  // requires a migration, not just a config change (documented in ADR 0005
  // as a known Phase-2 caveat).
  AI_EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1536),
  AI_MEMORY_CHUNK_SIZE: z.coerce.number().int().positive().default(800),
  AI_MEMORY_CHUNK_OVERLAP: z.coerce.number().int().nonnegative().default(120),
  AI_MEMORY_SEARCH_TOP_K: z.coerce.number().int().positive().default(8),

  AI_CHAT_STREAM_MAX_TOKENS: z.coerce.number().int().positive().default(4096),
  // Rate limiting (Security: Rate Limiting) — separate, tighter budget than
  // the global ThrottlerModule default, since a single AI turn is far more
  // expensive (provider $ + latency) than a typical CRUD request.
  AI_CHAT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
