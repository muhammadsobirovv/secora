#!/usr/bin/env bash
# PentestHub AI — Disaster Recovery: Recovery Testing (Module 14).
#
# Proves a DATABASE-scope backup is actually restorable, automatically,
# without touching the real database: downloads the most recent
# SUCCEEDED backup run via the Backup API, restores it into a *scratch*
# Postgres database on the same server, runs a handful of sanity
# queries against the restored data, then drops the scratch database.
# This is the concrete difference between "we have a backup file" and
# "we have verified the backup file actually restores to a working
# database" — `BackupService.verify()` (see backup-wizard.sh) only
# re-checksums the archive; it does not prove `pg_restore` succeeds
# against it, which is the failure mode this script exists to catch
# (e.g. a `pg_dump` that produced a truncated or corrupt custom-format
# archive that still passes a checksum on the bytes it did write).
#
# Run this periodically (e.g. weekly, via cron or a scheduled CI job) —
# see docs/operations/backup-recovery.md (Module 18 task #522) for the
# recommended cadence and what a failing run means operationally.
#
# Usage:
#   ./deploy/installer/recovery-test.sh --api-url http://localhost:3000 --token "$API_TOKEN"
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "${SCRIPT_DIR}/lib.sh"

API_URL="http://localhost:3000"
TOKEN="${PENTESTHUB_API_TOKEN:-}"
ORG_ID="_system"
SCRATCH_DB="pentesthub_recovery_test_$(date +%s)"
KEEP_SCRATCH=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-url) API_URL="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    --org) ORG_ID="$2"; shift 2 ;;
    --keep-scratch) KEEP_SCRATCH=true; shift ;;
    *) die "Unknown argument: $1" ;;
  esac
done

require_cmd curl
require_cmd python3
require_cmd pg_restore
require_cmd psql

auth_header=()
[[ -n "${TOKEN}" ]] && auth_header=(-H "Authorization: Bearer ${TOKEN}")

log "Fetching most recent SUCCEEDED DATABASE backup run"
runs_json="$(curl -sf "${auth_header[@]}" "${API_URL}/backups/${ORG_ID}/runs")"
LATEST_RUN_ID="$(python3 - "$runs_json" <<'PY'
import json, sys
runs = json.loads(sys.argv[1])
candidates = [r for r in runs if r.get("scope") in ("DATABASE", "FULL") and r.get("status") == "SUCCEEDED"]
candidates.sort(key=lambda r: r.get("startedAt", ""), reverse=True)
print(candidates[0]["id"] if candidates else "")
PY
)"
[[ -z "${LATEST_RUN_ID}" ]] && die "No SUCCEEDED DATABASE/FULL backup run found for org '${ORG_ID}' — run backup-wizard.sh first."
log "Testing recovery of backup run ${LATEST_RUN_ID}"

log "This script downloads the raw archive via GET /backups/${ORG_ID}/runs/${LATEST_RUN_ID}/download"
log "(see restore-instructions for the full manual procedure, including decryption if the archive is encrypted)"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT
ARCHIVE_PATH="${TMP_DIR}/backup.dump"

log "Downloading archive"
curl -sfL "${auth_header[@]}" -o "${ARCHIVE_PATH}" "${API_URL}/backups/${ORG_ID}/runs/${LATEST_RUN_ID}/download"

# Module 14 — Backup System encrypts DATABASE-scope archives with
# BACKUP_ENCRYPTION_KEY by default (BackupPolicy.encrypt=true) — decrypt
# before gunzip/pg_restore if this run was encrypted. Uses the same
# AES-256-GCM layout as apps/api/src/common/utils/buffer-encryption.util.ts
# (iv(12) || authTag(16) || ciphertext).
run_json="$(curl -sf "${auth_header[@]}" "${API_URL}/backups/${ORG_ID}/runs/${LATEST_RUN_ID}")"
ENCRYPTED="$(python3 -c "import json,sys; print('1' if json.loads(sys.argv[1]).get('encrypted') else '')" "${run_json}")"
if [[ -n "${ENCRYPTED}" ]]; then
  [[ -n "${BACKUP_ENCRYPTION_KEY:-}" ]] || die "This backup run is encrypted — set BACKUP_ENCRYPTION_KEY (the same value the deployment used at backup time) to decrypt it."
  require_cmd node
  node -e '
    const fs = require("fs");
    const crypto = require("crypto");
    const [inPath, outPath, keyB64] = process.argv.slice(1);
    const buf = fs.readFileSync(inPath);
    const iv = buf.subarray(0, 12);
    const authTag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);
    const key = Buffer.from(keyB64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key.subarray(0, 32), iv);
    decipher.setAuthTag(authTag);
    fs.writeFileSync(outPath, Buffer.concat([decipher.update(ciphertext), decipher.final()]));
  ' "${ARCHIVE_PATH}" "${ARCHIVE_PATH}.dec" "${BACKUP_ENCRYPTION_KEY}"
  mv "${ARCHIVE_PATH}.dec" "${ARCHIVE_PATH}"
fi
log "Decompressing archive"
# gzip -dc (not `gunzip`) — sidesteps gunzip's suffix-based renaming, which
# would otherwise refuse to touch a file that doesn't end in .gz (the
# downloaded file has no extension at all, by design of the download
# endpoint's Content-Disposition filename).
gzip -dc "${ARCHIVE_PATH}" > "${ARCHIVE_PATH}.decompressed"
mv "${ARCHIVE_PATH}.decompressed" "${ARCHIVE_PATH}"

PG_USER="${PGUSER:-pentesthub}"
log "Creating scratch database: ${SCRATCH_DB}"
createdb -U "${PG_USER}" "${SCRATCH_DB}"

cleanup_scratch() {
  if [[ "${KEEP_SCRATCH}" == true ]]; then
    log "Leaving scratch database '${SCRATCH_DB}' in place (--keep-scratch)."
  else
    log "Dropping scratch database: ${SCRATCH_DB}"
    dropdb -U "${PG_USER}" "${SCRATCH_DB}" --if-exists
  fi
}
trap 'cleanup_scratch; rm -rf "${TMP_DIR}"' EXIT

log "Restoring archive into scratch database (pg_restore)"
if ! pg_restore -U "${PG_USER}" -d "${SCRATCH_DB}" --no-owner --no-privileges "${ARCHIVE_PATH}"; then
  echo
  echo "RECOVERY TEST FAILED: pg_restore reported errors against the scratch database." >&2
  echo "This backup run (${LATEST_RUN_ID}) may not be safely restorable — investigate before relying on it." >&2
  exit 1
fi

log "Running sanity queries against the restored database"
TABLE_COUNT="$(psql -U "${PG_USER}" -d "${SCRATCH_DB}" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")"
if [[ "${TABLE_COUNT}" -lt 1 ]]; then
  echo "RECOVERY TEST FAILED: restored database has zero tables in the public schema." >&2
  exit 1
fi

log "Recovery test PASSED — restored ${TABLE_COUNT} table(s) from backup run ${LATEST_RUN_ID} into a scratch database and queried it successfully."
