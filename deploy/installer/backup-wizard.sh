#!/usr/bin/env bash
# PentestHub AI — Backup Wizard (Module 14: Installer / Backup System).
#
# Thin operator-facing wrapper around the real Backup System built in
# apps/api/src/modules/backups/backup.service.ts — it does not
# re-implement backup logic itself. Two modes:
#
#   1. API mode (default, preferred): the API is running, so this
#      script just calls BACKUP_RUN_ENDPOINTS over HTTP — the exact
#      same `pg_dump`-based DATABASE backup, encrypted with
#      BACKUP_ENCRYPTION_KEY, checksummed, and uploaded through
#      StorageService that a scheduled BackupPolicy run produces (see
#      that class's doc comment). Requires a bearer token — see
#      apps/api/src/modules/api-platform for how to mint an API key,
#      or run this against an internal-only endpoint with a
#      pre-provisioned token.
#   2. Offline mode (--offline, or automatic API-unreachable fallback):
#      no API required — runs `pg_dump`/`docker compose exec` directly
#      against the Postgres container/service, for a disaster-recovery
#      scenario where the API itself is down. This path does NOT
#      encrypt or checksum the way BackupService does — it's a last
#      resort, not a replacement for the real thing. Restore procedure
#      for either mode: see restoreInstructions()'s output
#      (BACKUP_RUN_ENDPOINTS.restoreInstructions) or, for offline
#      backups, `pg_restore` directly against the `.dump` file this
#      script writes.
#
# Usage:
#   ./deploy/installer/backup-wizard.sh --api-url http://localhost:3000 --token "$API_TOKEN"
#   ./deploy/installer/backup-wizard.sh --offline --out ./backups
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "${SCRIPT_DIR}/lib.sh"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

API_URL="http://localhost:3000"
TOKEN="${PENTESTHUB_API_TOKEN:-}"
ORG_ID="_system"
SCOPE="FULL"
OFFLINE=false
OUT_DIR="${REPO_ROOT}/backups"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-url) API_URL="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    --org) ORG_ID="$2"; shift 2 ;;
    --scope) SCOPE="$2"; shift 2 ;;
    --offline) OFFLINE=true; shift ;;
    --out) OUT_DIR="$2"; shift 2 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

run_offline_backup() {
  cd "${REPO_ROOT}"
  require_cmd docker
  mkdir -p "${OUT_DIR}"
  local pg_user timestamp out_file
  pg_user="$(grep -E '^POSTGRES_USER=' .env 2>/dev/null | cut -d= -f2- || echo pentesthub)"
  pg_user="${pg_user:-pentesthub}"
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  out_file="${OUT_DIR}/pentesthub-offline-${timestamp}.dump"

  log "Offline backup: pg_dump via docker compose exec (custom format, gzip-equivalent compression built in)"
  docker compose exec -T postgres pg_dump -U "${pg_user}" --format=custom --no-owner --no-privileges "${pg_user}" > "${out_file}"
  log "Wrote ${out_file} ($(du -h "${out_file}" 2>/dev/null | cut -f1))"
  echo
  echo "This is an UNENCRYPTED offline backup — the API-mode backup encrypts"
  echo "with BACKUP_ENCRYPTION_KEY by default (see BackupService.maybeEncrypt)."
  echo "Store ${out_file} accordingly (encrypted volume, restricted permissions)."
  echo
  echo "Restore with: docker compose exec -T postgres pg_restore -U ${pg_user} -d ${pg_user} --clean --if-exists < ${out_file}"
}

run_api_backup() {
  require_cmd curl
  require_cmd python3
  log "Triggering ${SCOPE} backup via API (${API_URL})"
  local auth_header=()
  [[ -n "${TOKEN}" ]] && auth_header=(-H "Authorization: Bearer ${TOKEN}")

  local response http_code body
  response="$(curl -s -w '\n%{http_code}' -X POST "${API_URL}/backups/${ORG_ID}/runs" \
    -H 'Content-Type: application/json' "${auth_header[@]}" \
    -d "{\"scope\":\"${SCOPE}\",\"encrypt\":true}")"
  http_code="$(echo "${response}" | tail -n1)"
  body="$(echo "${response}" | sed '$d')"

  if [[ "${http_code}" != "200" && "${http_code}" != "201" ]]; then
    warn "API backup request failed (HTTP ${http_code}): ${body}"
    return 1
  fi

  echo "${body}" | python3 -m json.tool 2>/dev/null || echo "${body}"
  local run_id
  run_id="$(echo "${body}" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("id",""))' 2>/dev/null || true)"
  if [[ -n "${run_id}" ]]; then
    log "Backup run ${run_id} triggered. Check status:"
    echo "  curl ${auth_header[*]} ${API_URL}/backups/${ORG_ID}/runs/${run_id}"
    echo "Restore instructions (never auto-restored — see ADR 0014):"
    echo "  curl ${auth_header[*]} ${API_URL}/backups/${ORG_ID}/runs/${run_id}/restore-instructions"
  fi
  return 0
}

log "PentestHub AI — Backup Wizard"

if [[ "${OFFLINE}" == true ]]; then
  run_offline_backup
  exit 0
fi

if run_api_backup; then
  exit 0
fi

warn "Falling back to offline pg_dump backup (API unreachable or request failed)."
run_offline_backup
