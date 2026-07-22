#!/usr/bin/env bash
# PentestHub AI — bare-metal/VM Linux installer (Module 10: Production
# Deployment). Installs the API + worker as systemd services running
# directly on the host (no Docker) — the alternative to
# docker-compose.yml/deploy/k8s for a team that wants a plain VM
# deployment. Assumes Ubuntu/Debian (apt) and a Postgres instance
# already reachable (either local `postgresql` package or a managed
# instance) — adapt the package-manager lines for other distros.
#
# Usage: sudo ./deploy/linux/install.sh /path/to/pentesthub-ai/checkout
set -euo pipefail

REPO_DIR="${1:?Usage: $0 <path to pentesthub-ai repo checkout>}"
INSTALL_DIR="/opt/pentesthub-ai"
CONFIG_DIR="/etc/pentesthub-ai"
SERVICE_USER="pentesthub"

if [[ $EUID -ne 0 ]]; then
  echo "This script must be run as root (it creates a system user and installs systemd units)." >&2
  exit 1
fi

echo "==> Creating service user '${SERVICE_USER}' (no login shell, no home directory writes outside its own storage dir)"
id -u "${SERVICE_USER}" &>/dev/null || useradd --system --no-create-home --shell /usr/sbin/nologin "${SERVICE_USER}"

echo "==> Installing Node.js 20 (NodeSource) and pnpm, if not already present"
if ! command -v node &>/dev/null || [[ "$(node -v)" != v20.* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
command -v pnpm &>/dev/null || npm install -g pnpm@9

echo "==> Copying application into ${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}"
# rsync (not cp -r) so re-running this installer to deploy an update
# doesn't need a separate "clean old files" step first.
rsync -a --delete \
  --exclude 'node_modules' --exclude '.git' --exclude '.turbo' \
  --exclude 'apps/*/node_modules' --exclude 'apps/*/.next' --exclude 'apps/*/dist' \
  "${REPO_DIR}/" "${INSTALL_DIR}/"

echo "==> Installing dependencies and building"
cd "${INSTALL_DIR}"
pnpm install --frozen-lockfile --prod=false
pnpm --filter api exec prisma generate
pnpm --filter api build

echo "==> Writing config directory (edit ${CONFIG_DIR}/*.env with real secrets before starting)"
mkdir -p "${CONFIG_DIR}"
if [[ ! -f "${CONFIG_DIR}/api.env" ]]; then
  cat > "${CONFIG_DIR}/api.env" <<'EOF'
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://pentesthub:CHANGE_ME@localhost:5432/pentesthub
DATABASE_POOL_MAX=10
JWT_ACCESS_SECRET=CHANGE_ME_32_PLUS_CHARS
CREDENTIAL_ENCRYPTION_KEY=CHANGE_ME_32_PLUS_CHARS_DIFFERENT
FRONTEND_URL=https://app.your-company.com
TRUST_PROXY_HOPS=1
LOG_LEVEL=info
EOF
  echo "    Wrote a template ${CONFIG_DIR}/api.env — edit it with real secrets before starting the service."
fi
[[ -f "${CONFIG_DIR}/worker.env" ]] || cp "${CONFIG_DIR}/api.env" "${CONFIG_DIR}/worker.env"
chmod 640 "${CONFIG_DIR}"/*.env
chown -R root:"${SERVICE_USER}" "${CONFIG_DIR}"

echo "==> Fixing ownership of the storage directory"
mkdir -p "${INSTALL_DIR}/apps/api/.storage"
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${INSTALL_DIR}/apps/api/.storage"

echo "==> Installing systemd units"
cp "${INSTALL_DIR}/deploy/linux/pentesthub-api.service" /etc/systemd/system/
cp "${INSTALL_DIR}/deploy/linux/pentesthub-worker.service" /etc/systemd/system/
systemctl daemon-reload

echo "==> Done. Next steps:"
echo "    1. Edit ${CONFIG_DIR}/api.env and ${CONFIG_DIR}/worker.env with real secrets."
echo "    2. First-time schema setup: sudo -u ${SERVICE_USER} env \$(cat ${CONFIG_DIR}/api.env | xargs) pnpm --filter api exec prisma db push --skip-generate"
echo "    3. systemctl enable --now pentesthub-api pentesthub-worker"
echo "    4. systemctl status pentesthub-api pentesthub-worker"
