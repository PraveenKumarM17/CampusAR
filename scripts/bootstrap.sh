#!/usr/bin/env bash
# CampusAR — one-command bootstrap: clone repo + run full setup
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/PraveenKumarM17/CampusAR/main/scripts/bootstrap.sh | bash
# Or:
#   bash bootstrap.sh
#   bash bootstrap.sh ~/projects/CampusAR
set -euo pipefail

REPO_URL="${CAMPUSAR_REPO_URL:-https://github.com/PraveenKumarM17/CampusAR.git}"
REPO_BRANCH="${CAMPUSAR_BRANCH:-main}"

# Install directory: first argument, or ~/CampusAR
INSTALL_DIR="${1:-${CAMPUSAR_INSTALL_DIR:-$HOME/CampusAR}}"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}CampusAR bootstrap${NC}"
echo "  Repository: ${REPO_URL}"
echo "  Branch:     ${REPO_BRANCH}"
echo "  Install to: ${INSTALL_DIR}"
echo ""

if [ -d "$INSTALL_DIR/.git" ]; then
  echo -e "${GREEN}Existing clone found — updating…${NC}"
  git -C "$INSTALL_DIR" fetch origin "$REPO_BRANCH" --depth 1 2>/dev/null || true
  git -C "$INSTALL_DIR" checkout "$REPO_BRANCH" 2>/dev/null || true
  git -C "$INSTALL_DIR" pull --ff-only origin "$REPO_BRANCH" 2>/dev/null || \
    echo "  (pull skipped — using existing files)"
elif [ -d "$INSTALL_DIR" ] && [ "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]; then
  echo -e "${RED}Error:${NC} ${INSTALL_DIR} exists and is not a git repo." >&2
  echo "  Remove it, pick another path, or run: bash bootstrap.sh /path/to/new/dir" >&2
  exit 1
else
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" "$INSTALL_DIR"
  echo -e "${GREEN}✓ Cloned successfully${NC}"
fi

export CAMPUSAR_INSTALL_DIR="$INSTALL_DIR"
bash "$INSTALL_DIR/scripts/setup.sh"
