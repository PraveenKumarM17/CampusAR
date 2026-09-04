# Database Migrations Guide

## Current Status
✅ **Database is fully migrated and operational**

All schema files have been applied successfully:
- schema.sql
- tenancy.sql  
- map-builder.sql
- map-builder-stabilization.sql
- map-builder-indoor.sql
- map-builder-versioning.sql
- map-builder-versioning-spatial.sql

## Running Migrations in Docker

### Method 1: Using npm Script (Recommended - NOW WORKING! ✅)

The Docker container now includes all necessary files to run migrations using the TypeScript migration runner:

```powershell
# Run all migrations
docker-compose exec api npm run db:migrate
```

**Output when successful:**
```
> @campusar/api@1.0.0 db:migrate
> tsx src/infrastructure/db/migrate.ts

Schema applied
```

**What it does:**
1. Reads environment variables (database connection string)
2. Connects to PostgreSQL
3. Scans `src/infrastructure/db/` for `.sql` files
4. Executes each migration in order
5. Reports "Schema applied" on success

**Why it works now:**
The Docker image includes both the migration files AND the config files needed by the TypeScript runner.

### Method 2: Direct SQL Execution (Alternative/Backup Method)

If you need to run SQL files manually or for debugging:

```powershell
# Copy SQL files to database container
docker cp apps/api/src/infrastructure/db/schema.sql campusar-db:/tmp/
docker cp apps/api/src/infrastructure/db/tenancy.sql campusar-db:/tmp/
docker cp apps/api/src/infrastructure/db/map-builder.sql campusar-db:/tmp/
docker cp apps/api/src/infrastructure/db/map-builder-stabilization.sql campusar-db:/tmp/
docker cp apps/api/src/infrastructure/db/map-builder-indoor.sql campusar-db:/tmp/
docker cp apps/api/src/infrastructure/db/map-builder-versioning.sql campusar-db:/tmp/
docker cp apps/api/src/infrastructure/db/map-builder-versioning-spatial.sql campusar-db:/tmp/

# Execute migrations
docker exec campusar-db psql -U campusar -d campusar -f /tmp/schema.sql
docker exec campusar-db psql -U campusar -d campusar -f /tmp/tenancy.sql
docker exec campusar-db psql -U campusar -d campusar -f /tmp/map-builder.sql
docker exec campusar-db psql -U campusar -d campusar -f /tmp/map-builder-stabilization.sql
docker exec campusar-db psql -U campusar -d campusar -f /tmp/map-builder-indoor.sql
docker exec campusar-db psql -U campusar -d campusar -f /tmp/map-builder-versioning.sql
docker exec campusar-db psql -U campusar -d campusar -f /tmp/map-builder-versioning-spatial.sql
```

### Method 3: Interactive psql

For manual database operations:

```powershell
docker exec -it campusar-db psql -U campusar -d campusar
```

Then run SQL commands directly:
```sql
SELECT * FROM users;
\dt  -- List all tables
\q   -- Quit
```

## Verifying Migrations

Check if tables exist:

```powershell
docker exec campusar-db psql -U campusar -d campusar -c "\dt"
```

Check specific table:

```powershell
docker exec campusar-db psql -U campusar -d campusar -c "SELECT COUNT(*) FROM users;"
```

## Adding New Migrations

1. **Create a new `.sql` file** in `apps/api/src/infrastructure/db/`
2. **Name it appropriately**: `04_add_feature.sql` (incremental numbering)
3. **Write your migration**:

```sql
-- Migration: Add new feature
BEGIN;

CREATE TABLE new_feature (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_new_feature_name ON new_feature(name);

COMMIT;
```

4. **Rebuild and restart the API** (to include the new SQL file):

```powershell
docker-compose build api
docker-compose up -d api
```

5. **Run migrations**:

```powershell
docker-compose exec api npm run db:migrate
```

## Troubleshooting

### Database Not Ready

If migrations fail with connection errors:

```powershell
# Check database health
docker-compose ps db

# Wait for "healthy" status, then retry
docker-compose exec api npm run db:migrate
```

### Migration Script Errors

If the migration script has errors, check the logs:

```powershell
docker-compose logs api
```

Common issues:
- **Connection refused**: Database not ready yet (wait a few seconds)
- **Module not found**: Rebuild the API container (`docker-compose build api`)
- **SQL syntax error**: Check your SQL file for syntax issues

## Resetting the Database

⚠️ **WARNING**: This deletes ALL data!

```powershell
# Stop and remove all containers and volumes
docker-compose down -v

# Start fresh
docker-compose up -d

# Wait for database to be healthy (check with: docker-compose ps)

# Run migrations
docker-compose exec api npm run db:migrate
```

## Backup and Restore

### Backup:
```powershell
docker exec campusar-db pg_dump -U campusar campusar > backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql
```

### Restore:
```powershell
Get-Content backup.sql | docker exec -i campusar-db psql -U campusar campusar
```

## What's in the Docker Container

The production Docker image includes:

✅ **Included:**
- Compiled JavaScript (`dist/` folder)
- SQL migration files (`src/infrastructure/db/*.sql`)
- Config module (`src/infrastructure/config/`)
- `tsx` TypeScript runtime
- All node_modules

❌ **Not included:**
- Full source code (only necessary parts)
- Development dependencies
- Test files

This setup allows migrations to run while keeping the image secure and reasonably sized.

## Quick Reference

| Task | Command |
|------|---------|
| Run migrations | `docker-compose exec api npm run db:migrate` |
| List tables | `docker exec campusar-db psql -U campusar -d campusar -c "\dt"` |
| Run SQL file | `docker exec campusar-db psql -U campusar -d campusar -f /tmp/file.sql` |
| Interactive shell | `docker exec -it campusar-db psql -U campusar -d campusar` |
| Backup database | `docker exec campusar-db pg_dump -U campusar campusar > backup.sql` |
| Check DB status | `docker-compose ps db` |
| View DB logs | `docker-compose logs -f db` |
| View API logs | `docker-compose logs -f api` |

## History

**Previous Issue (Fixed):**
Earlier versions of the Docker setup didn't include the config files, causing `npm run db:migrate` to fail with `Cannot find module '../config/env'`. This was fixed by updating `Dockerfile.api` to copy the necessary config directory.
