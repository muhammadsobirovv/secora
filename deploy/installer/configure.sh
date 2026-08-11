#!/usr/bin/env bash
# PentestHub AI — Configuration Wizard (Module 14: Installer). Edits an
# existing .env in place (unlike install.sh, which only writes one if
# absent) — walks through the settings an operator is most likely to
# need to change after first install: edition, provider selection,
# domain/URLs, OAuth. Never touches secrets that are already set
# (JWT_ACCESS_SECRET, CREDENTIAL_ENCRYPTION_KEY, POSTGRES_PASSWORD) —
# rotating those is a deliberate, disruptive action with its own
# considerations (invalidates every issued JWT / re-encryption of
# stored credentials), not something a routine config wizard should
# do silently. Run health-check.sh after applying changes.
#
# Usage: ./deploy/installer/configure.sh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "${SCRIPT_DIR}/lib.sh"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

[[ -f .env ]] || die ".env not found — run deploy/installer/install.sh first."

get_current() { grep -E "^$1=" .env 2>/dev/null | tail -n1 | cut -d= -f2- || true; }

set_env() {
  local key="$1" value="$2"
  if grep -qE "^${key}=" .env; then
    grep -vE "^${key}=" .env > .env.tmp && mv .env.tmp .env
  fi
  echo "${key}=${value}" >> .env
}

log "PentestHub AI — Configuration Wizard"
echo "Editing $(pwd)/.env. Press Enter to keep the current value."
echo

prompt_field() {
  local key="$1" label="$2"
  local current answer
  current="$(get_current "${key}")"
  read -r -p "${label} [${current}]: " answer || true
  [[ -n "${answer}" ]] && set_env "${key}" "${answer}"
}

prompt_field FRONTEND_URL "Frontend URL"
prompt_field NEXT_PUBLIC_API_URL "Public API URL"
prompt_field TRUST_PROXY_HOPS "Reverse-proxy hop count"
prompt_field LOG_LEVEL "Log level (debug/info/warn/error)"
prompt_field PENTESTHUB_EDITION "Edition (community/enterprise)"

echo
echo "OAuth (leave blank to keep disabled):"
prompt_field GOOGLE_CLIENT_ID "Google OAuth Client ID"
prompt_field GOOGLE_CLIENT_SECRET "Google OAuth Client Secret"
prompt_field GITHUB_CLIENT_ID "GitHub OAuth Client ID"
prompt_field GITHUB_CLIENT_SECRET "GitHub OAuth Client Secret"

echo
read -r -p "Validate and apply now (restarts services if using Docker Compose)? [y/N]: " apply || true
if [[ "${apply}" =~ ^[Yy]$ ]]; then
  MISSING=()
  for required in JWT_ACCESS_SECRET CREDENTIAL_ENCRYPTION_KEY POSTGRES_PASSWORD; do
    value="$(get_current "${required}")"
    [[ -z "${value}" ]] && MISSING+=("${required}")
  done
  if [[ ${#MISSING[@]} -gt 0 ]]; then
    die "Missing required secret(s): ${MISSING[*]}. Re-run install.sh or set these manually before applying."
  fi

  DEPLOYMENT_TYPE="$(detect_deployment_type)"
  case "${DEPLOYMENT_TYPE}" in
    compose)
      log "Restarting Docker Compose services"
      docker compose up -d --build
      ;;
    systemd)
      log "Restarting systemd services (requires sudo)"
      sudo systemctl restart pentesthub-api pentesthub-worker
      ;;
    *)
      warn "Could not detect a running deployment (compose/systemd) to restart automatically — restart it manually to apply these changes."
      ;;
  esac
  log "Running health check"
  "${SCRIPT_DIR}/health-check.sh" || warn "Health check failed after restart — check logs (docker compose logs api / journalctl -u pentesthub-api)."
else
  log "Changes written to .env but not applied — restart your deployment manually when ready."
fi
