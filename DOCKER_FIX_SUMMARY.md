# Docker Migration Fix Summary

**Date:** September 3, 2026  
**Issue:** `npm run db:migrate` failing in Docker with "Cannot find module '../config/env'"  
**Status:** ✅ **FIXED**

---

## The Problem

When running migrations in the Docker container:

```powershell
docker-compose exec api npm run db:migrate
```

The command failed with:

```
Error: Cannot find module '../config/env'
Require stack:
- /app/src/infrastructure/db/pool.ts
- /app/src/infrastructure/db/migrate.ts
```

## Root Cause

The TypeScript migration script has this dependency chain:

```
migrate.ts → pool.ts → ../config/env.ts
```

The Docker production image was only copying:
- ✅ `src/infrastructure/db/` (migration files)
- ❌ `src/infrastructure/config/` (MISSING!)

When `pool.ts` tried to import `../config/env`, it couldn't find the config directory.

## The Fix

Updated `Dockerfile.api` to include the config directory:

**Before:**
```dockerfile
# Copy built application and dependencies
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package*.json ./
COPY --from=builder /app/apps/api/src/infrastructure/db ./src/infrastructure/db
COPY --from=builder /app/node_modules ./node_modules
```

**After:**
```dockerfile
# Copy built application and dependencies
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package*.json ./
# Copy source files needed for migrations (db + config)
COPY --from=builder /app/apps/api/src/infrastructure/db ./src/infrastructure/db
COPY --from=builder /app/apps/api/src/infrastructure/config ./src/infrastructure/config
COPY --from=builder /app/node_modules ./node_modules
```

## Verification

After the fix, migrations work correctly:

```powershell
PS C:\SAMUDRA\OTHERS\CampusAR> docker-compose exec api npm run db:migrate

> @campusar/api@1.0.0 db:migrate
> tsx src/infrastructure/db/migrate.ts

Schema applied
```

All services are now healthy:

```
NAME           STATUS
campusar-api   Up 3 minutes (healthy)
campusar-db    Up 19 minutes (healthy)
campusar-web   Up 19 minutes
```

API health check:
```json
{"status":"ok","service":"campusar-api"}
```

## What Was Included

The Docker container now includes:

✅ **Compiled application** (`dist/`)  
✅ **Migration SQL files** (`src/infrastructure/db/*.sql`)  
✅ **Config module** (`src/infrastructure/config/env.ts`)  
✅ **Migration runner** (`src/infrastructure/db/migrate.ts`)  
✅ **TypeScript runtime** (`tsx` via node_modules)  
✅ **All dependencies** (node_modules)

This allows the migration script to:
1. Import config/env to read DATABASE_URL
2. Connect to PostgreSQL
3. Execute all SQL migration files
4. Report success

## Design Rationale

**Why include source files in production?**

This is a controlled exception to the "compiled-only" production rule:
- ✅ **Security**: Only migration-specific files (db/ and config/) are included, not the entire source
- ✅ **Maintainability**: Developers can use the familiar `npm run db:migrate` command
- ✅ **Flexibility**: Allows running migrations without manual SQL file copying
- ✅ **Size**: Minimal impact (~50KB of TypeScript files vs. GB of application data)

**Alternative approaches considered:**
1. ❌ Direct SQL execution only - Less convenient, requires manual file copying
2. ❌ Separate migration container - Overcomplicated for this use case
3. ❌ Pre-compiled migration script - Would need bundling, less maintainable
4. ✅ Include minimal source for migrations - **CHOSEN** (best balance)

## Updated Documentation

- ✅ `MIGRATIONS.md` - Updated to reflect that `npm run db:migrate` now works
- ✅ `Dockerfile.api` - Fixed to include config directory
- ✅ This summary document created

## Testing Checklist

- [x] Docker builds without errors
- [x] API container starts and is healthy
- [x] `npm run db:migrate` executes successfully
- [x] API health endpoint returns 200 OK
- [x] Database has all required tables
- [x] API can query database successfully

## Rollback Plan (if needed)

If this causes issues, you can rollback to direct SQL execution:

```powershell
# Method 1: Copy and execute SQL files
docker cp apps/api/src/infrastructure/db/schema.sql campusar-db:/tmp/
docker exec campusar-db psql -U campusar -d campusar -f /tmp/schema.sql

# (Repeat for all SQL files)
```

See `MIGRATIONS.md` for full direct execution instructions.

---

## Summary

✅ **Issue Fixed**: `npm run db:migrate` now works in Docker  
✅ **Root Cause**: Missing config directory in Docker image  
✅ **Solution**: Added `COPY` command for config files  
✅ **Testing**: All services healthy, migrations execute successfully  
✅ **Documentation**: Updated with working instructions  

The CampusAR application is now fully Dockerized and production-ready! 🎉
