#!/usr/bin/env bash
# PentestHub AI — Health Check (Module 14: Installer). Exercises the
# same liveness/readiness endpoints Kubernetes probes hit (see
# deploy/k8s/10-api-deployment.yaml and
# apps/api/src/modules/observability/controllers/health.controller.ts),
# so this script gives an operator on Compose/systemd/bare-metal the
# same signal an orchestrator gets automatically. Exit code is 0 only
# if every check passes — safe to use in CI or a cron-based alert.
#
# Usage: ./deploy/installer/health-check.sh [--url http://localhost:3000] [--quiet]
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "${SCRIPT_DIR}/lib.sh"

URL="http://localhost:3000"
QUIET=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) URL="$2"; shift 2 ;;
    --quiet) QUIET=true; shift ;;
    *) die "Unknown argument: $1" ;;
  esac
done

require_cmd curl

FAILED=0

check() {
  local name="$1" path="$2"
  local http_code
  http_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "${URL}${path}" || echo "000")"
  if [[ "${http_code}" == "200" ]]; then
    [[ "${QUIET}" == true ]] || echo "  [OK]   ${name} (${URL}${path} -> ${http_code})"
  else
    echo "  [FAIL] ${name} (${URL}${path} -> ${http_code})"
    FAILED=1
  fi
}

[[ "${QUIET}" == true ]] || log "PentestHub AI — Health Check (${URL})"

# Liveness — "is the process up at all", no dependency checks. Should
# recover on its own or be worth a process restart if this fails.
check "Liveness  " "/observability/health"
# Readiness — a real `SELECT 1` against Postgres (see
# health.controller.ts's doc comment on the liveness/readiness
# distinction) — should be pulled out of a load balancer's rotation,
# not restarted, if only this one fails.
check "Readiness " "/observability/health/ready"
# Startup — same handler as liveness (correct: Kubernetes' own
# startupProbe pattern for slow-starting apps reuses the liveness
# handler with more lenient timing rather than needing separate check
# logic — see deploy/k8s/10-api-deployment.yaml's startupProbe). Kept
# as a distinct check here for parity with that manifest and with
# Module 14's spec, which calls out "Startup Checks" as their own
# concept even where the underlying handler is shared.
check "Startup   " "/observability/health"

if command -v docker &>/dev/null && [[ -f "${SCRIPT_DIR}/../../docker-compose.yml" ]]; then
  cd "${SCRIPT_DIR}/../.."
  if docker compose ps --status running 2>/dev/null | grep -q .; then
    [[ "${QUIET}" == true ]] || echo "  [INFO] docker compose services running: $(docker compose ps --format '{{.Name}}' 2>/dev/null | tr '\n' ' ')"
  fi
fi

if [[ ${FAILED} -eq 0 ]]; then
  [[ "${QUIET}" == true ]] || log "All checks passed."
else
  echo "One or more health checks failed." >&2
fi
exit ${FAILED}
