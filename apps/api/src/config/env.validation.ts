import { z } from 'zod';

/// Fails fast at boot if a required secret/config value is missing or
/// malformed, instead of surfacing as a confusing runtime error later.
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // Module 10 — High Availability / Performance: the `pg` connection
  // pool's max size per API process (see PrismaService, which passes
  // this to `PrismaPg`'s underlying `node-postgres` Pool). The right
  // value scales with (a) the number of API replicas — every replica
  // opens its own pool, so total connections = replicas * this value,
  // which must stay under Postgres's own `max_connections` — and (b)
  // how much of this process's workload is DB-bound vs. CPU/network-
  // bound. 10 (node-postgres's own library default) is a conservative
  // starting point for a single replica in front of a modest Postgres
  // instance; a production deployment running N replicas should size
  // this as roughly `max_connections / N`, leaving headroom for
  // migrations/admin connections, and set it explicitly rather than
  // relying on the default once replica count is known.
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  JWT_REFRESH_TTL_REMEMBER_ME: z.string().default('30d'),

  // Local-First Migration Phase 1 (BYOK) — encrypts each workspace's own
  // AI provider API key (AiProviderCredential.encryptedApiKey) at rest via
  // AES-256-GCM (common/crypto/credential-encryption.util.ts). Same
  // "required, fails fast at boot" posture as JWT_ACCESS_SECRET, since a
  // missing/weak key here would mean user-supplied secrets are either
  // unrecoverable or under-protected.
  CREDENTIAL_ENCRYPTION_KEY: z
    .string()
    .min(32, 'CREDENTIAL_ENCRYPTION_KEY must be at least 32 characters'),

  FRONTEND_URL: z.string().url().default('http://localhost:3001'),
  MAIL_FROM: z.string().default('PentestHub AI <no-reply@pentesthub.local>'),
  // Module 15 — Integrations (task #338). `dev` (default, `DevMailService`)
  // needs no configuration and is Community Edition's default — mail is
  // logged and written to `.mail-outbox/` for manual inspection. `smtp`
  // (`SmtpMailService`) sends real mail through any standard SMTP relay —
  // self-hosted Postfix, MailHog for local dev (still free), or a paid
  // SendGrid/SES/Postmark SMTP endpoint if a deployment wants one. See
  // providers.module.ts.
  MAIL_PROVIDER: z.enum(['dev', 'smtp']).default('dev'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),

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
  // gemini-2.0-flash, not -pro: as of the free-tier landscape in 2026,
  // Gemini's Pro models require billing to be enabled, while Flash stays
  // free with the highest request/token quotas of the free-tier lineup —
  // the right default for a key obtained from Google AI Studio's free tier.
  AI_GEMINI_MODEL: z.string().default('gemini-2.0-flash'),

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

  // Voice Interaction (Module 5 Phase 2) — see
  // docs/adr/0005-ai-security-copilot-module.md. WEB_SPEECH (the browser's
  // built-in Web Speech API) needs no key and isn't listed here.
  // OPENAI_SPEECH reuses AI_OPENAI_API_KEY (Whisper + TTS are the same
  // OpenAI account as chat) rather than a second key. Every key below is
  // optional by the same "boots unconfigured, fails clearly on first use"
  // contract as the chat providers above.
  AI_SPEECH_AZURE_API_KEY: z.string().optional(),
  AI_SPEECH_AZURE_REGION: z.string().optional(),

  AI_SPEECH_GOOGLE_API_KEY: z.string().optional(),

  AI_SPEECH_ELEVENLABS_API_KEY: z.string().optional(),
  // A well-known public ElevenLabs sample voice ("Rachel") used as the
  // default when a caller doesn't specify one.
  AI_SPEECH_ELEVENLABS_VOICE_ID: z.string().default('21m00Tcm4TlvDq8ikWAM'),

  // Bug Bounty Workspace (Module 6) — see
  // docs/adr/0006-bug-bounty-workspace-module.md. Duplicate Detection reuses
  // the AI module's embedding pipeline (AiMemoryChunk, sourceType
  // 'BUGBOUNTY_FINDING'/'BUG_REPORT') rather than a second similarity
  // engine — this threshold is the only Module-6-specific knob.
  BUGBOUNTY_DUPLICATE_SIMILARITY_THRESHOLD: z.coerce
    .number()
    .min(0)
    .max(1)
    .default(0.75),
  BUGBOUNTY_DEFAULT_CURRENCY: z.string().default('USD'),
  // Deadline Notifier (Notifications: Report Deadlines / Reminder
  // Notifications) — a calendar event gets a REPORT_DEADLINE notification
  // once its dueAt falls within this many hours from now, checked every
  // BUGBOUNTY_DEADLINE_POLL_INTERVAL_MS.
  BUGBOUNTY_DEADLINE_LOOKAHEAD_HOURS: z.coerce.number().positive().default(48),
  BUGBOUNTY_DEADLINE_POLL_INTERVAL_MS: z.coerce
    .number()
    .positive()
    .default(300_000),

  // Module 10 — Distributed Job System. WorkerReaperService (worker
  // process) sweeps every WORKER_REAPER_POLL_INTERVAL_MS; a WorkerNode
  // whose lastHeartbeatAt is older than WORKER_HEARTBEAT_STALE_MS is
  // marked UNHEALTHY and any DistributedJob still RUNNING on it is
  // migrated back to QUEUED (job migration / dead-worker recovery).
  WORKER_HEARTBEAT_STALE_MS: z.coerce.number().int().positive().default(90_000),
  WORKER_REAPER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),

  // Module 10 — GraphQL API. Disabled by default (REST remains the
  // primary, documented surface); set to enable GET /graphql (Apollo
  // Sandbox) and POST /graphql in non-production, or explicitly opt in.
  GRAPHQL_PLAYGROUND_ENABLED: z.coerce.boolean().default(false),

  // Module 10 — native integrations. Every provider is optional (BYOK-style
  // — same posture as Module 5's AI provider credentials): a workspace/org
  // connects its own OAuth app or personal access token via
  // IntegrationConnection; these are only the *platform's own* OAuth app
  // credentials (client id/secret) used for the "Connect with GitHub" style
  // authorization-code flow. Unset = that provider's OAuth flow is
  // unavailable, but token-based connection (PAT) still works for any
  // provider that supports it (GitHub/GitLab/Jira/Linear/Notion/...).
  INTEGRATION_GITHUB_CLIENT_ID: z.string().optional(),
  INTEGRATION_GITHUB_CLIENT_SECRET: z.string().optional(),
  INTEGRATION_GITLAB_CLIENT_ID: z.string().optional(),
  INTEGRATION_GITLAB_CLIENT_SECRET: z.string().optional(),
  INTEGRATION_SLACK_CLIENT_ID: z.string().optional(),
  INTEGRATION_SLACK_CLIENT_SECRET: z.string().optional(),
  INTEGRATION_DISCORD_CLIENT_ID: z.string().optional(),
  INTEGRATION_DISCORD_CLIENT_SECRET: z.string().optional(),
  INTEGRATION_MS_TEAMS_CLIENT_ID: z.string().optional(),
  INTEGRATION_MS_TEAMS_CLIENT_SECRET: z.string().optional(),
  INTEGRATION_GOOGLE_CLIENT_ID: z.string().optional(),
  INTEGRATION_GOOGLE_CLIENT_SECRET: z.string().optional(),
  INTEGRATION_DROPBOX_CLIENT_ID: z.string().optional(),
  INTEGRATION_DROPBOX_CLIENT_SECRET: z.string().optional(),
  INTEGRATION_NOTION_CLIENT_ID: z.string().optional(),
  INTEGRATION_NOTION_CLIENT_SECRET: z.string().optional(),
  INTEGRATION_CALLBACK_BASE_URL: z.string().url().optional(),

  // Module 10 — Observability. OTLP collector endpoint for distributed
  // tracing (see observability/tracing.ts) — unset means tracing
  // initializes with a no-op exporter (spans are created but not shipped
  // anywhere), which is intentional for local dev/sandbox environments
  // that have no collector running.
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),

  // Module 10 — Plugin Marketplace. PEM-encoded Ed25519 SPKI public key the
  // marketplace verifies plugin-version signatures against (see
  // plugins/plugin-signature.util.ts). Unset = signature verification is
  // "attempted but always reported as unverifiable" rather than skipped —
  // a plugin can still be published/installed unsigned, but never carries
  // a `verified: true` badge in that environment.
  PLUGIN_MARKETPLACE_PUBLIC_KEY: z.string().optional(),

  // Module 11 — AI Security Copilot + Autonomous Multi-Agent System. See
  // docs/adr/0011-ai-security-copilot-multi-agent-system.md. These are
  // orchestrator-wide defaults; Privacy's "per-workspace provider
  // selection" itself lives in data (Workspace settings / BYOK credential
  // rows from Module 5 Phase 1), not env — this is only the *fallback*
  // mode when a workspace hasn't chosen one.
  AI_ORCHESTRATOR_MODE: z
    .enum(['CLOUD', 'LOCAL', 'HYBRID'])
    .default('CLOUD'),
  // Bounds how many AgentTasks within one OrchestrationRun can be RUNNING
  // concurrently — keeps one goal from fanning out into an unbounded number
  // of simultaneous provider calls.
  AI_ORCHESTRATOR_MAX_CONCURRENT_TASKS: z.coerce
    .number()
    .int()
    .positive()
    .default(3),
  // Task Delegation depth guard — a WORKFLOW_COORDINATOR task delegating to
  // sub-tasks that themselves delegate further stops being decomposition and
  // starts being a runaway loop past this depth.
  AI_ORCHESTRATOR_MAX_TASK_DEPTH: z.coerce.number().int().positive().default(4),
  // Retry Failed Tasks — matches AgentTask.retryCount's purpose.
  AI_ORCHESTRATOR_MAX_TASK_RETRIES: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(2),
  // Per-AgentTask wall-clock budget before the orchestrator marks it FAILED
  // and (depending on retry count) retries or gives up — prevents one stuck
  // tool call (Timeouts, under AI Tool Calling) from hanging the whole run.
  AI_ORCHESTRATOR_TASK_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(120_000),
  // AI_MEMORY_* above already tunes the RAG store itself; this is Long-Term
  // Memory's expiration-policy default — how long an AGENT_TASK_OUTPUT /
  // ORCHESTRATION_RUN memory chunk stays searchable before a background
  // sweep marks it expired. Null-equivalent (0) disables expiration.
  AI_MEMORY_DEFAULT_TTL_DAYS: z.coerce.number().int().nonnegative().default(0),

  // Module 13 — AI Automation Platform + MCP Ecosystem + Security Agent
  // SDK (task #275).
  // Master switch for `mcp/mcp-server.module.ts` — off by default so an
  // operator opts into exposing the MCP server rather than it appearing
  // automatically on upgrade.
  MCP_SERVER_ENABLED: z.coerce.boolean().default(false),
  // An MCP session with no activity for this long is treated as EXPIRED
  // by the same idle-sweep pattern Module 1's Session table already uses
  // (see auth/session-cleanup, mirrored here for McpSession).
  MCP_SESSION_IDLE_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(60),
  // Script Engine (task #286) wall-clock budget per execution — the
  // second argument to `vm.Script#runInContext`'s `timeout`, same
  // mechanism `PluginSandboxService` already uses.
  SCRIPT_ENGINE_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
  // Python scripts are accepted and stored (ScriptDefinition.language)
  // but rejected at execution time unless explicitly enabled — this
  // deployment's `apps/api` process has no Python interpreter available
  // to shell out to by default (see ScriptEngineService's doc comment).
  SCRIPT_ENGINE_PYTHON_ENABLED: z.coerce.boolean().default(false),

  // Module 14 — Cloud Platform, Enterprise SaaS, High Availability &
  // Global Infrastructure. `EditionService` is the single source of
  // truth every Enterprise-only surface (Tenant billing/branding,
  // custom domains) checks — default `community` so a fresh
  // `git clone` + `docker compose up` never accidentally boots into a
  // gated mode. `enterprise` only unlocks the *code paths*; an actual
  // active `License` row (or none) further determines what a specific
  // organization sees — see docs/adr/0014-cloud-platform-enterprise-saas-ha.md.
  PENTESTHUB_EDITION: z.enum(['community', 'enterprise']).default('community'),

  // Queue abstraction (QUEUE_SERVICE token, common/providers/queue/).
  // `memory` (default) is a real, fully-functional single-process queue
  // — correct for Community Edition's single-container deployment.
  // `redis` is for multi-replica deployments where more than one API/
  // worker process needs to observe the same queue; requires REDIS_URL.
  QUEUE_PROVIDER: z.enum(['memory', 'redis']).default('memory'),
  REDIS_URL: z.string().optional(),
  QUEUE_REDIS_KEY_PREFIX: z.string().default('pentesthub:queue:'),
  QUEUE_DEFAULT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  QUEUE_DEFAULT_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(2_000),

  // Object storage abstraction (STORAGE_SERVICE token, common/providers/
  // storage/). `local` (default, `LocalDiskStorageService`) needs no
  // configuration and is Community Edition's default — a Docker volume
  // is enough. `s3` covers AWS S3, MinIO (self-hosted, still free), and
  // Cloudflare R2/any S3-compatible endpoint via `STORAGE_S3_ENDPOINT`.
  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  STORAGE_S3_ENDPOINT: z.string().url().optional(),
  STORAGE_S3_REGION: z.string().default('auto'),
  STORAGE_S3_BUCKET: z.string().optional(),
  STORAGE_S3_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_S3_SECRET_ACCESS_KEY: z.string().optional(),
  // MinIO/some R2 setups need path-style URLs (`endpoint/bucket/key`)
  // instead of virtual-hosted-style (`bucket.endpoint/key`).
  STORAGE_S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  STORAGE_S3_PUBLIC_BASE_URL: z.string().url().optional(),

  // Cache abstraction (CACHE_SERVICE token, common/providers/cache/).
  // `memory` (default) is a real in-process LRU-ish TTL cache — correct
  // for a single-replica Community Edition install. `redis` is for
  // multi-replica deployments that need a shared cache; `disk` trades
  // memory for a filesystem-backed cache (useful for a memory-
  // constrained single box that still wants cache survival across
  // restarts).
  CACHE_PROVIDER: z.enum(['memory', 'redis', 'disk']).default('memory'),
  CACHE_DISK_DIR: z.string().default('.cache'),
  CACHE_DEFAULT_TTL_SECONDS: z.coerce.number().int().positive().default(300),

  // Database — Module 14 Database section. Read-replica routing is
  // opt-in: unset means every query goes to `DATABASE_URL` (correct for
  // Community Edition's single-Postgres-instance deployment). Set this
  // to route read-only queries (QueryBus handlers, via
  // `PrismaService.replica()`) to a separate connection pool.
  DATABASE_READ_REPLICA_URL: z.string().optional(),
  DATABASE_READ_REPLICA_POOL_MAX: z.coerce.number().int().positive().default(10),

  // Backup System / Disaster Recovery. `BACKUP_ENCRYPTION_KEY` mirrors
  // `CREDENTIAL_ENCRYPTION_KEY`'s AES-256-GCM posture — optional because
  // an operator can disable per-policy encryption (`BackupPolicy.encrypt
  // = false`) for a low-stakes dev deployment, but required (checked at
  // the service layer, not here) the moment any policy has `encrypt =
  // true`, the default.
  BACKUP_ENCRYPTION_KEY: z.string().min(32).optional(),
  BACKUP_PG_DUMP_BIN: z.string().default('pg_dump'),
  BACKUP_PG_RESTORE_BIN: z.string().default('pg_restore'),
  BACKUP_VERIFICATION_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(3_600_000),

  // Security — IP Allow Lists (optional, empty = disabled). Comma-
  // separated CIDR blocks/exact IPs; checked after `TRUST_PROXY_HOPS`
  // resolves the real client IP, so this is only as trustworthy as that
  // setting is correctly configured.
  IP_ALLOWLIST: z.string().optional(),
  // Mutual TLS is terminated by the reverse proxy/ingress in every
  // deployment this platform documents (nginx/Traefik/cloud LB), not by
  // the Node process itself — this flag only controls whether the API
  // *requires* the proxy-forwarded verified-client-cert header
  // (`MTLS_CLIENT_CERT_VERIFY_HEADER`) to be present, for defense in
  // depth against a misconfigured proxy that forwards traffic it should
  // have rejected.
  MTLS_REQUIRED: z.coerce.boolean().default(false),
  MTLS_CLIENT_CERT_VERIFY_HEADER: z.string().default('X-Client-Cert-Verify'),

  // Module 14 — Tenant Management (Enterprise Edition only). Shared
  // secret `BillingWebhookController` requires in an `X-Billing-Webhook-Secret`
  // header before trusting an inbound billing-provider event — this
  // platform ships no provider-specific (Stripe/Paddle/...) signature
  // verification since no specific provider is wired in by default (see
  // `BillingWebhookEventDto`'s doc comment); a deployment that adds one
  // should additionally verify that provider's own HMAC signature in
  // front of this shared-secret check, not instead of it. Unset (the
  // default) means the webhook endpoint rejects every request — there is
  // deliberately no "billing webhooks accepted with no secret configured"
  // mode, since that would let anyone flip an organization's subscription
  // state.
  BILLING_WEBHOOK_SECRET: z.string().min(16).optional(),

  // Centralized logging — correlation IDs / structured JSON logs.
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
  SLOW_QUERY_THRESHOLD_MS: z.coerce.number().int().positive().default(500),

  // Auto Update / version manifest (desktop, CLI, plugins). Every field
  // optional — an unset minimum version means "no enforced floor",
  // correct until an operator opts into requiring upgrades.
  AUTO_UPDATE_DESKTOP_LATEST_VERSION: z.string().optional(),
  AUTO_UPDATE_DESKTOP_MIN_VERSION: z.string().optional(),
  AUTO_UPDATE_CLI_LATEST_VERSION: z.string().optional(),
  AUTO_UPDATE_CLI_MIN_VERSION: z.string().optional(),
  AUTO_UPDATE_MOBILE_LATEST_VERSION: z.string().optional(),
  AUTO_UPDATE_MOBILE_MIN_VERSION: z.string().optional(),

  // Module 15 — Monetization. `BILLING_PROVIDER=none` (the default) is
  // the Community Edition state: `BillingService` still creates a real
  // `Subscription` row per organization (pinned to `PlanTier.FREE`), it
  // just never calls out to a payment provider. Setting `stripe` without
  // `STRIPE_SECRET_KEY` configured logs a warning rather than crashing
  // (the Stripe adapter is still selected — every call will fail until a
  // key is set) — see the `PAYMENT_PROVIDER` factory in
  // `apps/api/src/modules/billing/billing.module.ts`.
  // Module 15 — Release engineering (task #356). Purely informational —
  // no code path branches on this beyond surfacing it on the liveness
  // endpoint and in the Admin Console. `stable` is every tagged
  // `vX.Y.Z` release (see `.github/workflows/release.yml`); `beta` is a
  // `vX.Y.Z-beta.N` pre-release tag (same workflow, same verification
  // gate, published as a GitHub pre-release); `nightly` is an
  // operator-built image off `main` between releases. See
  // docs/architecture/release-engineering.md.
  RELEASE_CHANNEL: z.enum(['stable', 'beta', 'nightly']).default('stable'),
  BILLING_PROVIDER: z.enum(['none', 'stripe', 'manual']).default('none'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),

  // Module 15 — Telemetry (task #347). Opt-in, never required for core
  // functionality — unset/false means "send nothing," matching every
  // other optional integration's default-off posture in this platform.
  TELEMETRY_ENABLED: z.coerce.boolean().default(false),
  TELEMETRY_ENDPOINT: z.string().url().optional(),

  // Module 15 — first-run onboarding + demo mode (tasks #351-352).
  DEMO_MODE_ENABLED: z.coerce.boolean().default(false),
  // How long a POST /demo/session sandbox lives before DemoCleanupService
  // sweeps it. Kept short by default — a demo workspace only ever holds
  // pre-seeded synthetic data, so there's no data-loss risk in expiring it
  // aggressively, and a short TTL bounds storage growth from an
  // unauthenticated, publicly reachable endpoint.
  DEMO_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(24),

  // Module 15 — Support system (task #355). Where `POST /support/tickets`
  // forwards a notification email for an operator to triage — the same
  // "monitored inbox is the primary channel" posture SECURITY.md already
  // documents for security reports, reused here rather than building a
  // separate in-app ticket-management surface. There's no deployment-wide
  // "platform admin" role in this codebase to gate one behind (see
  // `ClusterOverviewService`'s doc comment on the same gap) — email is the
  // honest choice until that role exists, not a placeholder to be embarrassed
  // about.
  SUPPORT_INBOX_EMAIL: z.string().email().default('support@pentesthub.ai'),

  // Module 16 — CVE Intelligence (task #394). `none` (the default) means
  // `CveIntelligenceService` only ever reads its local cache — no
  // external network call, no API key required, matching the Community
  // Edition guarantee. Every named provider is a free, publicly
  // documented feed (NVD/CISA KEV/OSV/GitHub Advisories); `vendor` is a
  // deployment-specific webhook/URL an operator supplies themselves.
  CVE_INTELLIGENCE_PROVIDER: z
    .enum(['none', 'nvd', 'cisa_kev', 'osv', 'github_advisories', 'vendor'])
    .default('none'),
  CVE_INTELLIGENCE_REFRESH_INTERVAL_HOURS: z.coerce.number().int().positive().default(24),
  // Optional — NVD works unauthenticated (5 req/30s); a key raises that to
  // 50 req/30s. Never required, matching the Community Edition guarantee.
  NVD_API_KEY: z.string().optional(),
  // Required only when CVE_INTELLIGENCE_PROVIDER=vendor — the operator's
  // own CVE feed endpoint, expected to return the same shape as
  // CveRecordDto per CVE id (see docs/architecture/cve-intelligence.md).
  CVE_INTELLIGENCE_VENDOR_URL: z.string().optional(),

  // Module 16 — Security news feed (task #396). Off by default; an
  // operator opts in per-source.
  SECURITY_NEWS_PROVIDER: z.enum(['none', 'rss']).default('none'),
  SECURITY_NEWS_FEED_URLS: z.string().optional(),

  // Module 17 — Threat Intelligence Engine (tasks #465-469). Same shape
  // and same Community Edition guarantee as CVE_INTELLIGENCE_PROVIDER
  // above: `none` (default) means `ThreatIntelligenceService` only ever
  // reads/writes the local `Indicator`/`ThreatActor`/... cache — no
  // outbound network call, no key required. `cisa_kev`/`nvd`/`osv` reuse
  // the same free public feeds `CveIntelligenceService` already talks to
  // (kept as separate config so an operator can enable CVE enrichment
  // without also enabling indicator ingestion, or vice versa);
  // `stix_taxii` polls an operator-configured TAXII 2.1 collection;
  // `vendor` is a deployment-specific feed URL.
  THREAT_INTEL_PROVIDER: z
    .enum(['none', 'cisa_kev', 'nvd', 'osv', 'github_advisories', 'stix_taxii', 'vendor'])
    .default('none'),
  THREAT_INTEL_REFRESH_INTERVAL_HOURS: z.coerce.number().int().positive().default(24),
  // Required only when THREAT_INTEL_PROVIDER=stix_taxii — a TAXII 2.1
  // server root + collection id an operator has already been granted
  // access to. This platform is a TAXII *client* only; it never stands up
  // its own TAXII server.
  THREAT_INTEL_TAXII_SERVER_URL: z.string().optional(),
  THREAT_INTEL_TAXII_COLLECTION_ID: z.string().optional(),
  THREAT_INTEL_TAXII_API_KEY: z.string().optional(),
  // Required only when THREAT_INTEL_PROVIDER=vendor — the operator's own
  // indicator feed endpoint, expected to return a JSON array of
  // {type, value, confidence?, description?} objects (see
  // docs/architecture/threat-intelligence.md).
  THREAT_INTEL_VENDOR_URL: z.string().optional(),
  // Bounds how many indicators a single refresh/import call may write in
  // one request — never unbounded, matching every other bulk-ingest path
  // in this codebase (Recon findings, STIX bundle import, ...).
  THREAT_INTEL_MAX_INDICATORS_PER_IMPORT: z.coerce.number().int().positive().default(1000),

  // Module 16 — Terminal workspace + safe command execution (task #388).
  // Bounds every ad-hoc command the same way RECON_JOB_TIMEOUT_SECONDS
  // already bounds a Recon job — never unbounded.
  TERMINAL_COMMAND_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(120),

  // Module 16 — Approval gates (task #399). How long an unanswered
  // SecurityApprovalRequest stays PENDING before AiInvestigationExpiryService
  // marks it EXPIRED and fails the operation closed (never open).
  SECURITY_APPROVAL_DEFAULT_EXPIRY_MINUTES: z.coerce.number().int().positive().default(60),
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
