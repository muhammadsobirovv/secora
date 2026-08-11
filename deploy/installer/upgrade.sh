#!/usr/bin/env bash
# PentestHub AI — Upgrade Wizard (Module 14: Installer). Safe-by-default
# upgrade flow: records the current git ref (for rollback.sh), takes a
# backup via backup-wizard.sh, pulls the target ref, rebuilds, runs a
# schema update, restarts services, then health-checks the result. If
# the health check fails post-upgrade, this script does NOT auto-
# rollback (an unattended rollback on a health-check false-positive
# could mask a real issue) — it prints the exact rollback.sh invocation
# instead and exits non-zero so a CI/CD pipeline notices.
#
# Usage: ./deploy/installer/upgrade.sh [--ref v1.5.0] [--skip-backup]
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "${SCRIPT_DIR}/lib.sh"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

TARGET_REF="main"
SKIP_BACKUP=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref) TARGET_REF="$2"; shift 2 ;;
    --skip-backup) SKIP_BACKUP=true; shift ;;
    *) die "Unknown argument: $1" ;;
  esac
done

require_cmd git

DEPLOYMENT_TYPE="$(detect_deployment_type)"
[[ "${DEPLOYMENT_TYPE}" == "unknown" ]] && die "Could not detect deployment type (compose/systemd). Run install.sh first, or set DEPLOYMENT_TYPE in ${STATE_FILE} manually."
log "Detected deployment type: ${DEPLOYMENT_TYPE}"

PREVIOUS_REF="$(git rev-parse HEAD)"
state_set PREVIOUS_REF "${PREVIOUS_REF}"
state_set UPGRADE_STARTED_AT "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
log "Current ref recorded for rollback: ${PREVIOUS_REF}"

if [[ "${SKIP_BACKUP}" == true ]]; then
  warn "Skipping pre-upgrade backup (--skip-backup) — not recommended."
else
  log "Taking pre-upgrade backup"
  if ! "${SCRIPT_DIR}/backup-wizard.sh" --offline --out "${REPO_ROOT}/backups/pre-upgrade"; then
    die "Pre-upgrade backup failed — aborting upgrade. Use --skip-backup to proceed anyway (not recommended)."
  fi
  state_set LAST_PRE_UPGRADE_BACKUP_DIR "${REPO_ROOT}/backups/pre-upgrade"
fi

log "Fetching and checking out ${TARGET_REF}"
git fetch --tags origin
git checkout "${TARGET_REF}"
git pull --ff-only origin "${TARGET_REF}" 2>/dev/null || true
NEW_REF="$(git rev-parse HEAD)"

case "${DEPLOYMENT_TYPE}" in
  compose)
    log "Rebuilding and restarting Docker Compose services"
    ENTERPRISE_ARGS=()
    [[ -f docker-compose.enterprise.yml && -f .env.enterprise ]] && ENTERPRISE_ARGS=(-f docker-compose.enterprise.yml --env-file .env.enterprise)
    docker compose -f docker-compose.yml "${ENTERPRISE_ARGS[@]}" --env-file .env up -d --build
    log "Applying schema updates (prisma db push — safe/idempotent, see deploy/README.md's migration-history note)"
    docker compose exec -T api pnpm exec prisma db push --skip-generate
    ;;
  systemd)
    log "Rebuilding and restarting systemd services (requires sudo)"
    sudo rsync -a --delete --exclude 'node_modules' --exclude '.git' "${REPO_ROOT}/" /opt/pentesthub-ai/
    (cd /opt/pentesthub-ai && sudo -u pentesthub pnpm install --frozen-lockfile --prod=false && sudo -u pentesthub pnpm --filter api exec prisma generate && sudo -u pentesthub pnpm --filter api build)
    sudo systemctl restart pentesthub-api pentesthub-worker
    ;;
  kubernetes)
    warn "Kubernetes deployments upgrade via image tag, not this script — see deploy/k8s/README.md's 'Rolling updates' section (kubectl set image ...)."
    exit 0
    ;;
esac

state_set CURRENT_REF "${NEW_REF}"
state_set UPGRADE_COMPLETED_AT "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

log "Upgraded ${PREVIOUS_REF:0:12} -> ${NEW_REF:0:12}. Running health check..."
if "${SCRIPT_DIR}/health-check.sh"; then
  log "Upgrade successful and healthy."
else
  echo
  echo "Upgrade completed but health check FAILED. To roll back:" >&2
  echo "  ${SCRIPT_DIR}/rollback.sh" >&2
  exit 1
fi
