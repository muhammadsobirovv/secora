#!/usr/bin/env bash
# PentestHub AI — Interactive + CLI Installer (Module 14: Installer).
#
# Serves double duty as both the "Interactive Installer" (prompts for
# every choice) and the "CLI Installer" (fully non-interactive when
# every choice is passed as a flag or env var — the shape `quick-install.sh`
# drives). This script only sets up the Docker Compose deployment path
# (the fastest path to a running stack, and the one Community Edition's
# "no subscription required, no paid services" guarantee is easiest to
# demonstrate against); the Linux/Windows/Kubernetes paths have their
# own installers (deploy/linux/install.sh, deploy/windows/install-service.ps1,
# deploy/k8s/README.md) that this one deliberately does not duplicate.
#
# Usage (interactive):
#   ./deploy/installer/install.sh
#
# Usage (non-interactive / CLI installer):
#   ./deploy/installer/install.sh --non-interactive \
#     --edition community --queue in-memory --storage local --cache memory \
#     --domain localhost
#
# Usage (one-command installer): see quick-install.sh, which wraps this
# script for a `curl | bash` first-run experience.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "${SCRIPT_DIR}/lib.sh"

REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

NON_INTERACTIVE=false
EDITION="community"
QUEUE_PROVIDER="in-memory"
STORAGE_PROVIDER="local"
CACHE_PROVIDER="memory"
DOMAIN="localhost"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --non-interactive) NON_INTERACTIVE=true; shift ;;
    --edition) EDITION="$2"; shift 2 ;;
    --queue) QUEUE_PROVIDER="$2"; shift 2 ;;
    --storage) STORAGE_PROVIDER="$2"; shift 2 ;;
    --cache) CACHE_PROVIDER="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *) die "Unknown argument: $1 (see --help)" ;;
  esac
done

require_cmd docker
docker compose version &>/dev/null || die "Docker Compose v2 plugin not found (docker compose <subcommand>). Install it, then re-run."

prompt() {
  local question="$1" default="$2" var_name="$3"
  if [[ "${NON_INTERACTIVE}" == true ]]; then
    printf -v "${var_name}" '%s' "${default}"
    return
  fi
  local answer
  read -r -p "${question} [${default}]: " answer || true
  printf -v "${var_name}" '%s' "${answer:-${default}}"
}

log "PentestHub AI — Installer"
echo "This sets up the Docker Compose deployment (Postgres + api + worker + web)."
echo "Community Edition is fully functional with zero paid services — see"
echo "docker-compose.yml's header comment. Enterprise Edition adds optional"
echo "Redis/S3-compatible providers via docker-compose.enterprise.yml, which"
echo "this installer can wire up for you below."
echo

prompt "Edition (community/enterprise)" "${EDITION}" EDITION
prompt "Public domain/hostname this instance will be reached at" "${DOMAIN}" DOMAIN

# Module 20 — Phase 10 (deployment drift fix). This used to prompt for
# queue/storage/cache provider choices here, but nothing ever read the
# answers: docker-compose.enterprise.yml hardcodes QUEUE_PROVIDER=redis,
# CACHE_PROVIDER=redis, STORAGE_PROVIDER=s3 directly (not via an
# `${VAR:-default}` substitution), so every enterprise install has always
# gotten Redis+MinIO regardless of what was typed here. Removed the dead
# prompts rather than leave a misleading question in the installer; if
# per-install provider choice is wanted later, docker-compose.enterprise.yml
# itself needs to read those as substitutable env vars first.
if [[ "${EDITION}" == "enterprise" ]]; then
  log "Enterprise edition uses Redis (queue+cache) and MinIO (S3-compatible storage) — see docker-compose.enterprise.yml."
fi

if [[ -f .env ]]; then
  warn ".env already exists — leaving it untouched. Delete it first (or use configure.sh) to regenerate."
else
  log "Generating .env from .env.example"
  cp .env.example .env
  JWT_SECRET="$(gen_secret)"
  CRED_KEY="$(gen_secret)"
  PG_PASSWORD="$(gen_secret | tr -dc 'A-Za-z0-9' | cut -c1-32)"
  # Portable sed -i (GNU vs BSD differ on the -i argument) via a temp file.
  sed -e "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=${JWT_SECRET}|" \
      -e "s|^CREDENTIAL_ENCRYPTION_KEY=.*|CREDENTIAL_ENCRYPTION_KEY=${CRED_KEY}|" \
      -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${PG_PASSWORD}|" \
      -e "s|^FRONTEND_URL=.*|FRONTEND_URL=https://${DOMAIN}|" \
      .env > .env.tmp && mv .env.tmp .env
  echo "PENTESTHUB_EDITION=${EDITION}" >> .env
  log "Generated .env with fresh secrets. Review it before going to production (OAuth, observability token, etc. are still blank)."
fi

COMPOSE_ARGS=(-f docker-compose.yml)
if [[ "${EDITION}" == "enterprise" ]]; then
  if [[ -f .env.enterprise ]]; then
    warn ".env.enterprise already exists — leaving it untouched."
  else
    cp .env.enterprise.example .env.enterprise
    REDIS_PW="$(gen_secret | tr -dc 'A-Za-z0-9' | cut -c1-32)"
    MINIO_PW="$(gen_secret | tr -dc 'A-Za-z0-9' | cut -c1-32)"
    BACKUP_KEY="$(gen_secret)"
    sed -e "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=${REDIS_PW}|" \
        -e "s|^MINIO_ROOT_PASSWORD=.*|MINIO_ROOT_PASSWORD=${MINIO_PW}|" \
        -e "s|^BACKUP_ENCRYPTION_KEY=.*|BACKUP_ENCRYPTION_KEY=${BACKUP_KEY}|" \
        .env.enterprise > .env.enterprise.tmp && mv .env.enterprise.tmp .env.enterprise
    log "Generated .env.enterprise with fresh secrets."
  fi
  COMPOSE_ARGS+=(-f docker-compose.enterprise.yml)
  COMPOSE_ARGS+=(--env-file .env --env-file .env.enterprise)
else
  COMPOSE_ARGS+=(--env-file .env)
fi

log "Building and starting services (docker compose ${COMPOSE_ARGS[*]} up -d --build)"
docker compose "${COMPOSE_ARGS[@]}" up -d --build

log "Waiting for Postgres to be healthy"
PG_USER="$(grep -E '^POSTGRES_USER=' .env 2>/dev/null | cut -d= -f2-)"
for _ in $(seq 1 30); do
  if docker compose "${COMPOSE_ARGS[@]}" exec -T postgres pg_isready -U "${PG_USER:-pentesthub}" &>/dev/null; then
    break
  fi
  sleep 2
done

log "Applying database schema (first-run only — safe to re-run)"
docker compose "${COMPOSE_ARGS[@]}" exec -T api pnpm exec prisma db push --skip-generate

state_set DEPLOYMENT_TYPE compose
state_set EDITION "${EDITION}"
state_set INSTALLED_AT "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
state_set CURRENT_REF "$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

log "Done. Verifying health..."
"${SCRIPT_DIR}/health-check.sh" --url "http://localhost:3000" || warn "Health check did not pass yet — services may still be starting; re-run deploy/installer/health-check.sh in a minute."

echo
log "PentestHub AI is up. Web UI: http://localhost:3001  API: http://localhost:3000"
echo "    Next steps:"
echo "    - Review .env (and .env.enterprise, if applicable) for any blank OAuth/observability values."
echo "    - Run deploy/installer/configure.sh any time you need to change settings."
echo "    - Run deploy/installer/backup-wizard.sh to take your first backup."
