#!/usr/bin/env bash
# Bring up DB + API for local login (web: npm run dev:web in another terminal)
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Starting PostGIS..."
docker compose up -d db

echo "Waiting for database..."
for i in $(seq 1 40); do
  if docker exec campusar-db pg_isready -U campusar -d campusar >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "Applying seed (demo passwords admin123 / student123)..."
npm run db:seed

echo "Starting API on :4000..."
npm run dev:api
