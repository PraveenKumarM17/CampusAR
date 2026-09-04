# CampusAR Docker — Step-by-Step Commands

> Run all commands from the project root: `C:\SAMUDRA\OTHERS\CampusAR`

---

## First Time Setup

### Step 1: Make sure Docker Desktop is running
Open Docker Desktop and wait until it says "Docker is running".

### Step 2: Build all containers
```powershell
docker-compose build
```

### Step 3: Start all containers
```powershell
docker-compose up -d
```

### Step 4: Wait for the database to be healthy (~10 seconds)
```powershell
docker-compose ps
```
Make sure `campusar-db` shows **healthy** status before proceeding.

### Step 5: Run database migrations
```powershell
docker-compose exec api npm run db:migrate
```
You should see `Schema applied` — that means it worked.

### Step 6: Restart the API (so it picks up the new tables)
```powershell
docker-compose restart api
```

### Step 7: Verify everything is working
```powershell
docker logs campusar-api --tail 10
```
You should see:
```
CampusAR API listening on :4000
IoT simulator started (every 10000ms)
```
**No errors = success!**

---

## Access the App

| Service  | URL                          |
|----------|------------------------------|
| Website  | https://localhost             |
| API      | https://localhost/api         |
| Swagger  | http://localhost:4000/api/docs |

> Browser will warn about self-signed certificate — click "Advanced" → "Proceed" to continue.

---

## Daily Use (After First Setup)

### Start containers
```powershell
docker-compose up -d
```

### Stop containers
```powershell
docker-compose down
```

### View API logs (live)
```powershell
docker-compose logs -f api
```

### View all logs (live)
```powershell
docker-compose logs -f
```

---

## After Code Changes

### Rebuild and restart API only
```powershell
docker-compose build api
docker-compose up -d api
```

### Rebuild and restart Website only
```powershell
docker-compose build web
docker-compose up -d web
```

### Rebuild everything
```powershell
docker-compose build
docker-compose up -d
```

---

## If Database Gets Wiped (fresh volume)

### Step 1: Remove old volumes
```powershell
docker-compose down -v
```

### Step 2: Start fresh
```powershell
docker-compose up -d
```

### Step 3: Wait for DB healthy, then run migrations
```powershell
docker-compose exec api npm run db:migrate
```

### Step 4: Restart API
```powershell
docker-compose restart api
```

---

## Troubleshooting

### "relation X does not exist"
The database tables are missing. Run:
```powershell
docker-compose exec api npm run db:migrate
docker-compose restart api
```

### API container keeps restarting
Check logs first:
```powershell
docker logs campusar-api --tail 30
```
If it says "relation does not exist", run the migration commands above.

### Container won't start for exec commands
If you get "container is restarting" error, apply SQL directly:
```powershell
Get-Content apps/api/src/infrastructure/db/schema.sql | docker exec -i campusar-db psql -U campusar -d campusar
docker-compose restart api
```

### Nuclear reset (start completely fresh)
```powershell
docker-compose down -v --rmi all
docker-compose build
docker-compose up -d
docker-compose exec api npm run db:migrate
docker-compose restart api
```
