#!/usr/bin/env bash
# CampusAR — local development setup (clone, deps, database, migrate, seed)
set -euo pipefail

REPO_URL="${CAMPUSAR_REPO_URL:-https://github.com/PraveenKumarM17/CampusAR.git}"
REPO_BRANCH="${CAMPUSAR_BRANCH:-main}"
INSTALL_DIR="${CAMPUSAR_INSTALL_DIR:-}"
MIN_NODE_MAJOR=20
DB_HOST="${CAMPUSAR_DB_HOST:-localhost}"
DB_PORT="${CAMPUSAR_DB_PORT:-5433}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}▸${NC} $*"; }
ok()    { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}!${NC} $*"; }
fail()  { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

node_major() {
  node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0
}

docker_compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    fail "Docker Compose not found. Install Docker Desktop or docker-compose plugin."
  fi
}

wait_for_postgres() {
  local tries=0
  local max=60
  info "Waiting for PostgreSQL on ${DB_HOST}:${DB_PORT}…"
  while [ "$tries" -lt "$max" ]; do
    if command -v pg_isready >/dev/null 2>&1; then
      if pg_isready -h "$DB_HOST" -p "$DB_PORT" -U campusar >/dev/null 2>&1; then
        ok "PostgreSQL is ready"
        return 0
      fi
    elif docker exec campusar-db pg_isready -U campusar -d campusar >/dev/null 2>&1; then
      ok "PostgreSQL is ready (via Docker)"
      return 0
    elif (echo >/dev/tcp/"$DB_HOST"/"$DB_PORT") >/dev/null 2>&1; then
      ok "PostgreSQL port is open"
      sleep 2
      return 0
    fi
    tries=$((tries + 1))
    sleep 2
  done
  fail "PostgreSQL did not become ready in time. Check: docker compose logs db"
}

resolve_project_dir() {
  if [ -n "$INSTALL_DIR" ]; then
    PROJECT_DIR="$(cd "$INSTALL_DIR" && pwd)"
    return
  fi

  # Running from inside the repo (scripts/setup.sh)
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [ -f "$script_dir/../package.json" ] && [ -f "$script_dir/../docker-compose.yml" ]; then
    PROJECT_DIR="$(cd "$script_dir/.." && pwd)"
    return
  fi

  fail "Set CAMPUSAR_INSTALL_DIR to your clone path, or run scripts/bootstrap.sh to clone first."
}

clone_if_needed() {
  if [ -n "$INSTALL_DIR" ] && [ ! -d "$INSTALL_DIR/.git" ]; then
    info "Cloning ${REPO_URL} (branch: ${REPO_BRANCH})…"
    git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" "$INSTALL_DIR"
    ok "Repository cloned to ${INSTALL_DIR}"
  fi
}

check_prerequisites() {
  info "Checking prerequisites…"
  need_cmd git
  need_cmd node
  need_cmd npm
  need_cmd docker

  local major
  major="$(node_major)"
  if [ "$major" -lt "$MIN_NODE_MAJOR" ]; then
    fail "Node.js ${MIN_NODE_MAJOR}+ required (found v$(node -v)). Install from https://nodejs.org/"
  fi
  ok "Node $(node -v), npm $(npm -v)"

  if ! docker info >/dev/null 2>&1; then
    fail "Docker is installed but not running. Start Docker Desktop / docker daemon and retry."
  fi
  ok "Docker is running"
}

setup_env() {
  if [ ! -f .env ]; then
    cp .env.example .env
    ok "Created .env from .env.example"
  else
    warn ".env already exists — leaving unchanged"
  fi
}

install_dependencies() {
  info "Installing npm dependencies (this may take a few minutes)…"
  npm install
  ok "Dependencies installed"
}

start_database() {
  info "Starting PostgreSQL (Docker)…"
  docker_compose up -d db
  wait_for_postgres
}

run_migrations() {
  info "Applying database migrations…"
  npm run db:migrate
  ok "Migrations applied"
}

run_seed() {
  info "Seeding demo campus data…"
  npm run db:seed
  ok "Database seeded"
}

verify_setup() {
  info "Running quick typecheck…"
  if npm run typecheck >/dev/null 2>&1; then
    ok "Typecheck passed"
  else
    warn "Typecheck reported issues — you can still try npm run dev:api / dev:web"
  fi
}

print_success() {
  echo ""
  echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  CampusAR setup complete!${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
  echo ""
  echo "  Project folder: ${PROJECT_DIR}"
  echo ""
  echo "  Start development (two terminals):"
  echo "    cd \"${PROJECT_DIR}\""
  echo "    npm run dev:api    # API  → http://localhost:4000"
  echo "    npm run dev:web    # Web  → http://localhost:5173"
  echo ""
  echo "  Demo admin login:"
  echo "    Email:    admin@smartcampus.edu"
  echo "    Password: admin123"
  echo ""
  echo "  Or click \"Continue as Guest\" on the landing page."
  echo ""
  echo "  API docs: http://localhost:4000/api/docs"
  echo ""
}

main() {
  echo ""
  echo -e "${BLUE}CampusAR setup${NC}"
  echo ""

  clone_if_needed
  resolve_project_dir
  cd "$PROJECT_DIR"

  check_prerequisites
  setup_env
  install_dependencies
  start_database
  run_migrations
  run_seed
  verify_setup
  print_success
}

main "$@"
