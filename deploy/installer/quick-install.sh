#!/usr/bin/env bash
# Secora AI — One Command Installer (Module 14: Installer).
#
# The `curl | bash` entry point: clones the repo (or a specific
# release tag) into a target directory and hands off to install.sh
# with Community Edition defaults, non-interactively. Meant for
# "I just want it running, ask me nothing" first-time setup on a clean
# machine — anyone who wants to choose providers/edition should run
# deploy/installer/install.sh directly instead (interactive mode) after
# cloning, or pass this script's own flags through.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/<org>/pentesthub-ai/main/deploy/installer/quick-install.sh | bash
#   # or, with options:
#   curl -fsSL .../quick-install.sh | bash -s -- --dir ~/pentesthub-ai --ref v1.4.0 --edition enterprise
#
# Deliberately does NOT curl-pipe into `sudo bash` — Docker Compose
# deployments don't need root, and a one-command installer that asks
# for root over an unauthenticated pipe is a bigger risk than the
# convenience is worth. If you need the Linux systemd path (which does
# need root), use deploy/linux/install.sh directly after cloning, not
# this script.
set -euo pipefail

REPO_URL="${PENTESTHUB_REPO_URL:-https://github.com/pentesthub-ai/pentesthub-ai.git}"
TARGET_DIR="${HOME}/pentesthub-ai"
REF="main"
EDITION="community"
EXTRA_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir) TARGET_DIR="$2"; shift 2 ;;
    --ref) REF="$2"; shift 2 ;;
    --edition) EDITION="$2"; shift 2 ;;
    *) EXTRA_ARGS+=("$1"); shift ;;
  esac
done

command -v git &>/dev/null || { echo "ERROR: git is required." >&2; exit 1; }
command -v docker &>/dev/null || { echo "ERROR: Docker is required — install Docker Engine + Compose plugin first: https://docs.docker.com/engine/install/" >&2; exit 1; }

if [[ -d "${TARGET_DIR}/.git" ]]; then
  echo "==> ${TARGET_DIR} already exists — fetching updates instead of re-cloning"
  git -C "${TARGET_DIR}" fetch --tags origin
  git -C "${TARGET_DIR}" checkout "${REF}"
  git -C "${TARGET_DIR}" pull --ff-only origin "${REF}" 2>/dev/null || true
else
  echo "==> Cloning ${REPO_URL} (ref: ${REF}) into ${TARGET_DIR}"
  git clone --branch "${REF}" --depth 1 "${REPO_URL}" "${TARGET_DIR}" \
    || git clone "${REPO_URL}" "${TARGET_DIR}" # fall back to a full clone + checkout if the ref isn't a branch (e.g. a tag not covered by --depth 1 in older git)
  [[ -d "${TARGET_DIR}/.git" ]] && git -C "${TARGET_DIR}" checkout "${REF}" 2>/dev/null || true
fi

exec "${TARGET_DIR}/deploy/installer/install.sh" --non-interactive --edition "${EDITION}" "${EXTRA_ARGS[@]}"
