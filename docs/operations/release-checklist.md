# Release checklist: Oracle ARM VM

Target: 2 vCPU, 11 GB RAM, about 45 GB disk (about 77% used before this release),
`linux/arm64`. Everything here is a checklist for a person to run; none of it is
automatic, and nothing in the repository touches the server or DNS.

The general go-live list is in [production-deployment.md](./production-deployment.md);
this page is what is specific to the scan engine release. The authorization model
is in [scan-authorization.md](./scan-authorization.md), the tools in
[pentest-tools.md](./pentest-tools.md).

## 0. Before you touch the server (on your machine)

- [ ] `pnpm --filter api test:safety` passes. This is the named safety suite
      (redirects, DNS rebinding, scope, proxy, attested single-host scans, audit
      redaction, production refusal of private targets, concurrency cap, ROE
      stop). Do not release on a red run.
- [ ] `pnpm --filter api jest` shows only the known baseline failures (26 suites
      that fail without this change too).
- [ ] `npx tsc --noEmit -p apps/api/tsconfig.build.json`, `pnpm --filter web check-types`,
      `pnpm --filter web lint` (this includes the i18n check), `pnpm --filter web build`.
- [ ] `.\scripts\worker-dev.ps1 up` then `tools`: every tool `OK`.
- [ ] The browser end-to-end run (`pnpm --filter web e2e`) is green.

## 1. Disk first (the VM is nearly full)

An arm64 worker build writes several GB of layers. Look before you build:

```bash
df -h /
docker system df
docker builder prune --filter until=72h -f     # old build cache, keeps recent layers
docker image prune -f                          # dangling images
docker images --format '{{.Repository}}:{{.Tag}} {{.Size}}' | sort -k2 -h | tail
```

You want **at least 8 GB free** before building on the VM. If you cannot get there:

- build the images on another arm64 machine and `docker save | ssh ... docker load`
  (or push to a registry and pull), instead of building on the VM;
- `docker builder prune -a -f` (cold cache, slower next build);
- remove images you no longer run (`docker image rm`). Never
  `docker system prune --volumes` while Postgres lives in a Docker volume.

## 2. Build or pull the images

On the VM (native arm64, so no emulation):

```bash
cd /srv/secora          # wherever the checkout lives
git fetch && git checkout <release-tag-or-commit>
docker compose build api worker web
```

or pull the images you built elsewhere. The worker image verifies every tool's
SHA256 for `linux/arm64`; a changed upstream archive fails the build, which is the
intended behaviour. After the build:

```bash
docker run --rm --entrypoint sh <worker-image> -c 'for t in httpx nuclei katana subfinder dnsx naabu ffuf dalfox; do /opt/secora-tools/bin/$t -version 2>&1 | grep -i version | head -1; done'
```

## 3. Migrations: order and the date check

The Prisma migration history in this repository has two kinds of folder names:

- older folders dated in the **future** (`20261101…` to `20261216…`), which are
  already applied on environments that have them. **Never rename an applied
  migration folder**: Prisma records the name, and a rename makes the history diverge.
- newer folders dated with the **real date** (`20261023120000_roe_authorizations`,
  `20261024090000_worker_tool_status`).

`prisma migrate deploy` applies every pending migration whatever its position in
the order, so the newer, earlier-dated folders apply fine on a database that already
has the future-dated ones (checked on the development database). The rules:

- [ ] **Check the dates before you merge a migration**: its folder timestamp must
      not be later than today's real date. `ls apps/api/prisma/migrations | tail`.
- [ ] A new migration must not depend on objects created by a migration dated
      **after** it (a fresh database applies them in folder order). The two new
      ones are independent: ROE adds enum values and its own tables, the worker
      tool status is one standalone table.
- [ ] Take a database backup first ([backup-recovery.md](./backup-recovery.md)).
- [ ] Apply. **Note:** the compose `migrate` service runs `prisma db push
      --accept-data-loss`, not `prisma migrate deploy`: it brings the database to
      `schema.prisma` and forces through any destructive change. So first run it
      WITHOUT the flag, which refuses (and prints why) if anything would be lost:
      `docker compose run --rm migrate sh node_modules/.bin/prisma db push`.
      Only if it applies cleanly, or the only warnings are ones you understand,
      continue. Do not use `--accept-data-loss` on production without a fresh backup.
- [ ] Known limitation, unchanged: replaying the whole history on an **empty**
      database fails on an old migration that references a missing `organizations`
      table. Production and dev databases are not affected (they are migrated
      incrementally); do not use "recreate from scratch" as a recovery plan without
      the backup.

## 4. Environment variables

Set in the server's `.env` (secrets from your secret store, not from git):

| Variable | Value | Why |
|---|---|---|
| `NODE_ENV` | `production` | Turns on the startup refusal below |
| `ACTIVE_SCAN_ALLOW_PRIVATE_TARGETS` | `false` (default) | The API and worker **refuse to start** if this is `true` in production |
| `SCAN_DEEP_PROFILE_ENABLED` | `false` (default) | DEEP stays off until you decide; it also needs proof of control and `confirmDeep` per scan |
| `SCAN_TOOL_MAX_RSS_MB` | `1024` on this VM | Memory ceiling per scan tool; the default 1536 is too generous for 11 GB shared with the API, Postgres and the web app |
| `VULN_WORKER_CONCURRENCY` | `1` | One scan at a time on 2 vCPU (default 2) |
| `VULN_SCAN_MAX_PER_TARGET_PER_HOUR` / `VULN_SCAN_MAX_PER_WORKSPACE_PER_HOUR` | defaults 6 / 30 | Rate limits |
| `VULN_JOB_TIMEOUT_SECONDS` | default 1800 | Per-job ceiling; profiles raise it to cover their stages |
| `VULN_TOOL_BIN_HTTPX`, `_NUCLEI`, `_KATANA`, `_SUBFINDER`, `_DNSX`, `_NAABU`, `_FFUF`, `_DALFOX` | already set in `Dockerfile.worker` to `/opt/secora-tools/bin/<tool>`, and `VULN_NUCLEI_TEMPLATES_DIR` | Do not override them unless you ship the tools elsewhere; the worker's boot table tells you if one is wrong |
| `MAIL_PROVIDER` | `smtp` | Client approval emails (ROE) need a real mailer; `dev` only writes files |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | your relay | `MAIL_FROM` defaults to `Secora AI <no-reply@secora.group>`; the sending domain needs SPF/DKIM or the approval emails land in spam |
| `FRONTEND_URL` | `https://secora.group` | Approval and revoke links in emails are built from it |
| `AI_*_API_KEY` | optional | Without a provider, report explanations use the built-in text |

- [ ] The API sends every email (approval, confirmation, requester notice), so the mail
      variables and `FRONTEND_URL` matter on the API container. The worker needs
      `DATABASE_URL`, the secrets, the AI keys and the scan variables above.
- [ ] Container limits for the worker in the compose file: `mem_limit` about 3g and
      `cpus` about 1.5, so a runaway scan cannot take the whole VM. The per-tool
      memory ceiling above stops a single tool first.

## 5. Domain: old name to secora.group

The app answers on `secora.group`. The old `pentesthubai.com` (and `www.`) should
send people there with a permanent redirect that keeps the path, so old shared
links and report links keep working:

```nginx
server {
    listen 80;
    listen 443 ssl;
    http2 on;
    server_name pentesthubai.com www.pentesthubai.com;
    # same certificate block as the main server (certificate for the old name too)
    return 301 https://secora.group$request_uri;
}
```

- [ ] The certificate for the old names stays valid until the redirect is no longer
      needed (an expired certificate shows a browser warning instead of redirecting).
- [ ] `FRONTEND_URL`, `NEXT_PUBLIC_API_URL`, the CORS list and the OAuth callback
      URLs use `secora.group`. Existing shared report links contain only a token and
      keep working through the redirect.
- [ ] `curl -sI https://pentesthubai.com/shared/x` shows `301` and
      `location: https://secora.group/shared/x`.

(DNS and nginx are changed by you on the server; this repository does not do it.)

## 6. Deploy

```bash
docker compose run --rm migrate          # step 3
docker compose up -d api worker web
docker compose ps
docker compose logs --tail 80 worker     # the "Tool preflight" table: all OK
```

The worker prints its tool table at boot and keeps it fresh every five minutes.
A platform admin can also read it at `GET /admin/worker-tools` (it returns one row
per worker with `healthy`, `stale` and every tool's status and version).

## 7. Smoke test

Run these from your machine against production. They only read, or scan the
**lab-style** target you own.

```bash
# the site and the API are up
curl -fsS https://secora.group/ -o /dev/null -w '%{http_code}\n'
curl -fsS https://secora.group/api/observability/health   # adjust to your API path

# the redirect (section 5)
curl -sI https://pentesthubai.com/ | head -3

# worker tools (needs an admin token)
curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" $API/admin/worker-tools | jq '.[] | {workerName, healthy, stale}'
```

Then, signed in as a normal test user, in the browser (phone width too):

1. Add a site you own, choose **I own it**, run a **Quick** scan, watch the live
   progress, open the report. It must say the owner **confirmed** ownership (not
   verified) and that scope is this host only.
2. Share the report (expiry and password), open the link in a private window.
3. "I'm testing for a client": request, open the email, approve, scan, revoke from
   the confirmation email; the scan must stop.
4. Confirm **DEEP is not offered** and `POST /targets/:targetId/vuln/jobs` with
   `profile: "DEEP"` is refused (`SCAN_PROFILE_DISABLED`).

## 8. What happens to existing targets

Nothing has to be done for them. **Quick and Standard** now run on the owner's
attestation alone, limited to the single attested host (no subdomains). A target
that was already verified (DNS, file or meta tag) keeps its verification and keeps
covering what it covered; its reports say "verified". Targets with an attestation
and no proof can scan Quick and Standard from the first day. **DEEP** still needs
proof of control or an approved client engagement, plus the deployment flag and
`confirmDeep`. Past reports are not rewritten: a report only claims what its scan
ran under.

## 9. Resource guard behaviour (what to expect under load)

- One scan at a time per worker (`VULN_WORKER_CONCURRENCY`), one scan per target at a
  time, and per-target and per-workspace hourly limits.
- Every stage has a time limit; every tool runs at lowered priority (`nice`);
  every tool has a memory ceiling (`SCAN_TOOL_MAX_RSS_MB`). A tool that passes it is
  stopped, its partial output is kept, and the job log says so.
- A missing or broken tool fails its stage with the reason; the job ends "Completed
  with errors" and the report carries an "incomplete scan" banner.

## 10. Rollback

1. **Application**: redeploy the previous images
   (`docker compose up -d api worker web` after checking out the previous tag, or
   retag the previous images). The new migrations are additive (new tables, new
   enum values): the previous release ignores them, so **no database rollback is
   needed** to go back.
2. **If you must undo the migrations** (rarely): restore the pre-deploy backup.
   Do not hand-edit `_prisma_migrations`.
3. **If only the scan engine misbehaves**: stop the worker
   (`docker compose stop worker`). Queued jobs wait; nothing scans; the web app and
   existing reports keep working.
4. **Redirect**: remove the `server` block for the old name only if the old name
   must serve the app again.

## 11. After the release

- [ ] `docker system df` and `df -h /`: note the disk use, prune the build cache if
      it grew.
- [ ] Watch the worker log for `Tool preflight` errors and for `ROE_SCAN_STOPPED` /
      `ACTIVE_SCAN_BLOCKED` audit entries that look unexpected.
- [ ] Re-run the smoke test after the next DNS or certificate change.
