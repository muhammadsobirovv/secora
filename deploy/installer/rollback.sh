#!/usr/bin/env bash
# Secora AI — Rollback Support (Module 14: Installer). Reverts to
# the git ref recorded by the last upgrade.sh run and, if requested,
# restores the pre-upgrade database backup that upgrade.sh took
# automatically. This is deliberately a separate, explicit script
# rather than something upgrade.sh runs automatically on failure — see
# upgrade.sh's header comment for why.
#
# Usage:
#   ./deploy/installer/rollback.sh                 # code rollback only
#   ./deploy/installer/rollback.sh --restore-backup # code + database restore
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "${SCRIPT_DIR}/lib.sh"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

RESTORE_BACKUP=false
[[ "${1:-}" == "--restore-backup" ]] && RESTORE_BACKUP=true

PREVIOUS_REF="$(state_get PREVIOUS_REF '')"
[[ -z "${PREVIOUS_REF}" ]] && die "No PREVIOUS_REF recorded in ${STATE_FILE} — nothing to roll back to (rollback.sh only undoes the most recent upgrade.sh run)."

DEPLOYMENT_TYPE="$(detect_deployment_type)"
log "Rolling back to ${PREVIOUS_REF} (deployment type: ${DEPLOYMENT_TYPE})"

read -r -p "This will check out ${PREVIOUS_REF:0:12} and restart services. Continue? [y/N]: " confirm || true
[[ "${confirm}" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

git checkout "${PREVIOUS_REF}"

case "${DEPLOYMENT_TYPE}" in
  compose)
    ENTERPRISE_ARGS=()
    [[ -f docker-compose.enterprise.yml && -f .env.enterprise ]] && ENTERPRISE_ARGS=(-f docker-compose.enterprise.yml --env-file .env.enterprise)
    docker compose -f docker-compose.yml "${ENTERPRISE_ARGS[@]}" --env-file .env up -d --build
    ;;
  systemd)
    sudo rsync -a --delete --exclude 'node_modules' --exclude '.git' "${REPO_ROOT}/" /opt/pentesthub-ai/
    (cd /opt/pentesthub-ai && sudo -u pentesthub pnpm install --frozen-lockfile --prod=false && sudo -u pentesthub pnpm --filter api exec prisma generate && sudo -u pentesthub pnpm --filter api build)
    sudo systemctl restart pentesthub-api pentesthub-worker
    ;;
  *)
    warn "Could not detect a running deployment to restart — code has been checked out; restart your services manually."
    ;;
esac

if [[ "${RESTORE_BACKUP}" == true ]]; then
  BACKUP_DIR="$(state_get LAST_PRE_UPGRADE_BACKUP_DIR '')"
  [[ -z "${BACKUP_DIR}" || ! -d "${BACKUP_DIR}" ]] && die "No recorded pre-upgrade backup directory found (or it no longer exists) — cannot restore the database automatically. Restore manually from your own backups."
  LATEST_DUMP="$(find "${BACKUP_DIR}" -name '*.dump' -type f | sort | tail -n1)"
  [[ -z "${LATEST_DUMP}" ]] && die "No .dump file found in ${BACKUP_DIR}."
  log "Restoring database from ${LATEST_DUMP}"
  PG_USER="$(grep -E '^POSTGRES_USER=' .env 2>/dev/null | cut -d= -f2- || echo pentesthub)"
  docker compose exec -T postgres pg_restore -U "${PG_USER:-pentesthub}" -d "${PG_USER:-pentesthub}" --clean --if-exists < "${LATEST_DUMP}"
  log "Database restored."
fi

state_set CURRENT_REF "${PREVIOUS_REF}"
state_set ROLLED_BACK_AT "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

log "Rollback complete. Running health check..."
"${SCRIPT_DIR}/health-check.sh" || warn "Health check still failing after rollback — this may indicate a non-code issue (infrastructure, database, configuration)."
