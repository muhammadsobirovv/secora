#!/usr/bin/env bash
# Secora AI — installer suite shared helpers (Module 14: Installer).
# Sourced by every script in this directory; never run directly.
#
# State file: every script in this directory reads/writes a small
# key=value state file (default `.pentesthub-installer-state` in the
# install directory) so `upgrade.sh` can record what `install.sh`
# chose (deployment type, install dir) and what version was running
# before an upgrade, and `rollback.sh`/`backup-wizard.sh` can find that
# same information later without re-asking the operator. This is
# intentionally a flat, human-readable/editable file, not a database —
# an installer that can't be inspected or hand-edited when something
# goes wrong is worse than no installer.
set -euo pipefail

STATE_FILE="${PENTESTHUB_STATE_FILE:-.pentesthub-installer-state}"

log()  { echo "==> $*"; }
warn() { echo "WARNING: $*" >&2; }
die()  { echo "ERROR: $*" >&2; exit 1; }

# state_get KEY [default]
state_get() {
  local key="$1" default="${2:-}"
  [[ -f "${STATE_FILE}" ]] || { echo "${default}"; return; }
  local value
  value="$(grep -E "^${key}=" "${STATE_FILE}" 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
  echo "${value:-${default}}"
}

# state_set KEY VALUE — replaces an existing key or appends it.
state_set() {
  local key="$1" value="$2"
  touch "${STATE_FILE}"
  if grep -qE "^${key}=" "${STATE_FILE}" 2>/dev/null; then
    # portable in-place edit (works on both GNU and BSD sed without a
    # backup-suffix footgun) via a temp file rather than `sed -i`.
    grep -vE "^${key}=" "${STATE_FILE}" > "${STATE_FILE}.tmp"
    mv "${STATE_FILE}.tmp" "${STATE_FILE}"
  fi
  echo "${key}=${value}" >> "${STATE_FILE}"
}

# detect_deployment_type — best-effort guess at how this machine is
# running Secora AI, used to pick sensible defaults in the other
# scripts. Always overridable with an explicit --type flag.
detect_deployment_type() {
  local recorded
  recorded="$(state_get DEPLOYMENT_TYPE '')"
  if [[ -n "${recorded}" ]]; then
    echo "${recorded}"
    return
  fi
  if command -v docker &>/dev/null && [[ -f docker-compose.yml ]] && docker compose ps --format json &>/dev/null; then
    echo "compose"
  elif systemctl list-units --full -all 2>/dev/null | grep -q pentesthub-api.service; then
    echo "systemd"
  elif command -v kubectl &>/dev/null && kubectl get namespace pentesthub &>/dev/null; then
    echo "kubernetes"
  else
    echo "unknown"
  fi
}

gen_secret() {
  node -e "console.log(require('crypto').randomBytes(48).toString('base64'))" 2>/dev/null \
    || openssl rand -base64 48 2>/dev/null \
    || die "Need either node or openssl on PATH to generate secrets."
}

require_cmd() {
  command -v "$1" &>/dev/null || die "Required command '$1' not found on PATH."
}
