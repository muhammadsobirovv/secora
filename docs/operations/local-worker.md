# Running the real worker locally (Windows, no tools installed)

Every pentest tool (httpx, nuclei, katana, subfinder, dnsx, naabu, ffuf, dalfox)
runs in the **worker image**, on the server. Users never install anything, and on
your Windows machine you do not either: the dev worker is the same image the
server runs, started in Docker next to the API and database you already run.

```
 your machine (Windows)                          Docker Desktop (Linux)
 ┌───────────────────────────┐                  ┌──────────────────────────────┐
 │ pnpm dev (API :4000)      │                  │ worker-dev   (real image,    │
 │ pnpm dev (web :3001)      │   same Postgres  │   all tools, nice + limits)  │
 │ Postgres :5432  ◄─────────┼──────────────────┼── host.docker.internal       │
 └───────────────────────────┘                  │ juice.lab.test / dvwa.lab.test│
                                                └──────────────────────────────┘
```

## One command

From the repo root, in Windows PowerShell (Docker Desktop must be running):

```powershell
.\scripts\worker-dev.ps1 up
```

That builds `pentesthub-worker:dev` if needed (first build about 11 minutes on a
home connection, a few seconds when only the TypeScript changed and the layers are
cached) and starts the worker. Check what it found:

```powershell
.\scripts\worker-dev.ps1 tools
```

```
Tool preflight:
  httpx      OK              [INF] Current Version: v1.12.0  (/opt/secora-tools/bin/httpx)
  nuclei     OK              [INF] Nuclei Engine Version: v3.11.1  (/opt/secora-tools/bin/nuclei)
  ...
```

Other commands: `lab-up` / `lab-down`, `logs`, `status`, `build`, `rebuild`
(`--no-cache`), `shell`, `down`. Add `-Deep` to `up` to turn the DEEP profile on in
the worker (the API in `apps/api/.env` needs `SCAN_DEEP_PROFILE_ENABLED=true` too).

## What the script does for you

- Reads `apps/api/.env` (the same file the API uses, so JWT, encryption key and AI
  keys agree) and passes it to the container.
- Rewrites only `DATABASE_URL`: `127.0.0.1` or `localhost` becomes
  `host.docker.internal`, because from inside the container your database is the
  host. The value holds the password; it goes through the environment and is never
  printed.
- Sets `NODE_ENV=development` and `ACTIVE_SCAN_ALLOW_PRIVATE_TARGETS=true`
  **inside the dev container only**. The lab lives on private addresses, and a
  production API refuses to start with that flag. Never copy those two lines to a
  server.
- Caps the container (`mem_limit 3g`, `cpus 1.5`, `pids_limit 1024`) and every tool
  (`SCAN_TOOL_MAX_RSS_MB`, default 1536) so a scan behaves like it will on a small
  server.

The worker takes jobs from the same database as your API: start a scan from the
web app and the container runs it. The migration `worker_tool_status` must be
applied (`npx prisma migrate deploy` in `apps/api`).

## The lab

```powershell
.\scripts\worker-dev.ps1 lab-up
```

| Lab | From your browser | From the worker |
|---|---|---|
| OWASP Juice Shop | http://127.0.0.1:3300 | `juice.lab.test` |
| DVWA | http://127.0.0.1:4280 | `dvwa.lab.test` |

Scan **only** these (and sites you own). Add `juice.lab.test` as a target, choose
"I own it" and start a Quick or Standard scan. DEEP needs proof of control; see
[scan-authorization.md](./scan-authorization.md) and the lab recipe in
[pentest-tools.md](./pentest-tools.md).

## When something is off

| Symptom | Likely cause |
|---|---|
| Script says Docker is not running | Start Docker Desktop, wait for the whale to settle |
| Worker restarts in a loop, "database" in the log | The API's Postgres is not listening on 5432, or its password has characters that need URL-encoding |
| `tools` shows MISSING / BROKEN | The image is stale or damaged: `.\scripts\worker-dev.ps1 rebuild` |
| Scan stays queued | Worker not running (`status`), or a scan is already running for that target (one at a time per target) |
| "Tool ... is not available on this worker" in a job | The same table as above, reported per stage; the job is "Completed with errors", never plain "Completed" |

## Disk space: pruning the build cache

Image builds leave a lot of cache behind (a full worker build writes several GB of
layers). On the Oracle VM this matters more than here; the same commands apply.

```powershell
docker system df                        # what is using space
docker builder prune --filter until=72h # old build cache, keeps recent layers
docker builder prune -a                 # all build cache (next build starts cold)
docker image prune -f                   # dangling images
```

`docker builder prune` never removes images or volumes. Do not run
`docker system prune --volumes` on a machine whose Postgres data lives in a Docker
volume.

## Architecture note

Docker Desktop on this machine is `linux/amd64`, so the dev image is amd64. The
production server is `linux/arm64`: build there (or with `docker buildx build
--platform linux/arm64`, slow under emulation). The Dockerfile pins and verifies
both architectures' tool checksums.

## End-to-end run (real API, real worker image, the lab)

Three things prove the engine end to end. They need the stack running: Postgres, the
API (built: `pnpm --filter api build`, then `node apps/api/dist/src/main.js`; `tsx`
does not emit the decorator metadata Nest needs for every class), the web app
(`pnpm --filter web dev`), the dev worker and the lab.

```powershell
.\scripts\worker-dev.ps1 up
.\scripts\worker-dev.ps1 lab-up
```

### 1. The API-level run (scans, refusals, shares, exports, PDF, AI)

```bash
# phase 1: SCAN_DEEP_PROFILE_ENABLED=false
ACTIVE_SCAN_ALLOW_PRIVATE_TARGETS=true node apps/api/dist/src/main.js
node scripts/e2e/engine-e2e.mjs --phase 1

# phase 2: DEEP on, with the AI request log and the lab proof stub
cd apps/api
NODE_EXTRA_CA_CERTS=../../docker/lab-proof/tls/cert.pem \
AI_REQUEST_LOG=/tmp/ai-requests.log.jsonl \
ACTIVE_SCAN_ALLOW_PRIVATE_TARGETS=true SCAN_DEEP_PROFILE_ENABLED=true \
node --require ../../scripts/e2e/log-ai-requests.cjs --require ../../scripts/e2e/lab-resolver.cjs dist/src/main.js
node scripts/e2e/engine-e2e.mjs --phase 2     # from the repo root
```

(Phase 2 needs the worker started with `-Deep`. A STANDARD scan of Juice Shop takes
about 17 minutes, a DEEP one about 20; `--standard-job <id>` follows a scan that is
already running.) The PDF is read back with `pdftotext` (poppler, shipped with Git for
Windows), which counts the pages and checks their text.

**The lab proof stub.** The ownership probe only fetches over https on port 443 and
refuses any private or loopback address, with no switch (correctly). A lab on private
addresses can therefore never prove control the normal way. `scripts/e2e/lab-resolver.cjs`
is a preload for the **API process of this run only**: it resolves the lab name
`proof.lab.test` to a public-looking address and sends the TCP connection to the lab proxy
(`docker/lab-proof`, published on 127.0.0.1:3301, self-signed certificate trusted through
`NODE_EXTRA_CA_CERTS`). The probe, its checks and the token comparison run unchanged.
Generate the certificate once:

```bash
openssl req -x509 -newkey rsa:2048 -nodes -keyout docker/lab-proof/tls/key.pem \
  -out docker/lab-proof/tls/cert.pem -days 30 -subj "/CN=proof.lab.test" \
  -addext "subjectAltName=DNS:proof.lab.test"
```

### 2. The safety suite

```powershell
pnpm --filter api test:safety
```

Run it before every release. It is the real-socket file
`vuln/safety/safety-regression.spec.ts` plus the unit suites that own each rule:

| Rule | Where it is tested |
|---|---|
| A redirect to a private address / metadata / loopback is not followed | `safety-regression` (real proxy and fetch), `pinning-proxy`, `scope-guard` |
| DNS rebinding after verification is blocked | `scope-guard`, `pin.util`, `vuln-scan-job-execution.pipeline` |
| A discovered out-of-scope subdomain is dropped | `scope-guard`, `pipeline-orchestrator` |
| An attested (unverified) scan never leaves the single host | `safety-regression`, `ownership-scope`, `target-authorization` |
| The proxy refuses everything but the pinned host | `safety-regression`, `pinning-proxy` |
| Production refuses `ACTIVE_SCAN_ALLOW_PRIVATE_TARGETS` | `safety-regression`, `env.validation` |
| Rate limit, quota and concurrency caps hold | `scan-admission`, `safety-regression` (poller cap), `create-vuln-scan-job` |
| Audit entries exist and are redacted | `safety-regression`, `scan-command-audit`, `redact-argv` |
| ROE expiry or revocation stops a running scan | `pipeline-orchestrator`, `vuln-scan-job-execution`, `roe` |
| A missing or broken tool fails its stage | `tool-preflight`, `pipeline-orchestrator`, `probe-stage` |

### 3. The browser run (360 px)

```powershell
pnpm --filter web e2e
```

Playwright, with the Chrome installed on the machine, at 360 px: sign in, add the site,
"I own it", Quick scan, live progress, the report, a share link opened signed out;
the client path with the dev mail outbox (request, approval link, approve, scan
allowed, withdraw while the scan runs, scan stopped); and the negatives (DEEP absent
from the interface and refused by the API, an IP asset, a mailbox on another domain, an
unproven written-permission target). `E2E_WEB_URL` and `E2E_API_URL` override the
addresses (defaults `http://localhost:3001` and `http://127.0.0.1:4000`).
