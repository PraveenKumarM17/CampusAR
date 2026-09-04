# CampusAR Docker Setup Guide

This guide will help you run CampusAR locally using Docker containers.

---

## Prerequisites

### 1. Install Docker Desktop

**Windows:**
- Download from: https://www.docker.com/products/docker-desktop
- Install Docker Desktop for Windows
- Enable WSL 2 backend (recommended)
- Start Docker Desktop

**Verify Installation:**
```bash
docker --version
docker-compose --version
```

---

## Quick Start

### 1. **Setup Environment Variables**

Copy the Docker environment template:

```bash
# Windows PowerShell
Copy-Item .env.docker .env

# Or manually copy .env.docker to .env and edit as needed
```

**Edit `.env` file** and change the security secrets (especially for production):
- `JWT_ACCESS_SECRET` - Make it long and random
- `JWT_REFRESH_SECRET` - Make it long and random
- `POSTGRES_PASSWORD` - Change from default

### 2. **Build and Start Services**

```bash
# Build all containers (first time or after code changes)
docker-compose build

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

**Services will be available at:**
- 🌐 **Web App (HTTPS)**: https://localhost
- 🌐 **Web App (HTTP)**: http://localhost (redirects to HTTPS)
- 🔌 **API**: http://localhost:4000
- 🗄️ **PostgreSQL**: localhost:5433

### 3. **Initialize Database**

Run migrations and seed data:

```bash
# Run database migrations
docker-compose exec api npm run db:migrate

# Seed initial data (optional)
docker-compose exec api npm run db:seed
```

### 4. **Access the Application**

Open your browser:
```
https://localhost
```

**Accept the self-signed certificate warning:**
- Click "Advanced" → "Proceed to localhost (unsafe)"
- This is normal for local development

---

## Using AR Measure on Your Phone

### 1. **Find Your Computer's IP Address**

**Windows:**
```powershell
ipconfig
# Look for "IPv4 Address" (e.g., 192.168.1.100)
```

**Mac/Linux:**
```bash
ifconfig | grep "inet "
# Or: hostname -I
```

### 2. **Access from Phone**

Make sure your phone is on the **same WiFi network**, then open:

```
https://192.168.1.100
```
(Replace with your actual IP address)

### 3. **Accept Certificate**

Your phone will show a security warning (normal for self-signed certificates):

- **Chrome (Android)**: "Advanced" → "Proceed to... (unsafe)"
- **Safari (iOS)**: "Show Details" → "visit this website"

### 4. **Test AR Measure**

1. Login to the app
2. Go to: **Admin → Map Build**
3. Select a building
4. Tap **"AR Measure"** button
5. Grant camera permissions
6. Tap **"Start AR"**
7. Point at floor and tap to measure!

---

## Docker Commands Reference

### Container Management

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# Restart a specific service
docker-compose restart api

# View running containers
docker-compose ps

# View logs
docker-compose logs -f [service-name]
docker-compose logs -f api    # API logs only
docker-compose logs -f web    # Web logs only
```

### Rebuilding

```bash
# Rebuild all containers (after code changes)
docker-compose build

# Rebuild specific service
docker-compose build api

# Rebuild and restart
docker-compose up -d --build
```

### Database Management

```bash
# Access PostgreSQL CLI
docker-compose exec db psql -U campusar -d campusar

# Backup database
docker-compose exec db pg_dump -U campusar campusar > backup.sql

# Restore database
docker-compose exec -T db psql -U campusar campusar < backup.sql

# View database logs
docker-compose logs -f db
```

### Accessing Container Shells

```bash
# Access API container bash
docker-compose exec api sh

# Access web container bash
docker-compose exec web sh

# Access database container bash
docker-compose exec db sh
```

### Cleanup

```bash
# Stop and remove all containers
docker-compose down

# Remove containers and volumes (⚠️ deletes database)
docker-compose down -v

# Remove all unused Docker resources
docker system prune -a
```

---

## Container Architecture

```
┌─────────────────────────────────────────┐
│          Your Browser/Phone             │
│     https://localhost or https://IP     │
└────────────────┬────────────────────────┘
                 │ Port 443 (HTTPS)
                 │ Port 80 (HTTP → HTTPS)
                 ▼
┌─────────────────────────────────────────┐
│     campusar-web (Nginx Container)      │
│  - Serves React app (static files)      │
│  - Proxies /api → API container          │
│  - Proxies /ws → WebSocket              │
│  - Self-signed SSL certificate          │
└────────────────┬────────────────────────┘
                 │ Internal network
                 ▼
┌─────────────────────────────────────────┐
│    campusar-api (Node.js Container)     │
│  - Express REST API (Port 4000)         │
│  - WebSocket server                     │
│  - Business logic                       │
└────────────────┬────────────────────────┘
                 │ Internal network
                 ▼
┌─────────────────────────────────────────┐
│   campusar-db (PostgreSQL Container)    │
│  - PostgreSQL 16                        │
│  - Persistent volume storage            │
│  - Port 5433 (exposed to host)          │
└─────────────────────────────────────────┘
```

---

## Troubleshooting

### "Cannot connect to Docker daemon"
- Ensure Docker Desktop is running
- Check Docker Desktop settings
- Restart Docker Desktop

### "Port is already allocated"
- Another service is using ports 80, 443, 4000, or 5433
- Stop the conflicting service or change ports in `docker-compose.yml`

### "Database connection failed"
- Wait for database to be ready: `docker-compose logs -f db`
- Check database health: `docker-compose ps`
- Run migrations: `docker-compose exec api npm run db:migrate`

### "Certificate warnings won't go away"
- This is normal for self-signed certificates
- Accept the warning each time (can't be avoided in dev)
- For production, use a proper SSL certificate

### "WebXR AR not available"
- Must use HTTPS (not HTTP)
- Must access from ARCore/ARKit compatible device
- Check browser: Chrome on Android, Safari on iOS

### "Cannot access from phone"
- Ensure phone and computer on same WiFi
- Check firewall isn't blocking ports 80/443
- Verify IP address is correct
- Try accessing from computer first to verify it works

### Container won't start
```bash
# Check logs
docker-compose logs [service-name]

# Remove and recreate
docker-compose down
docker-compose up -d --force-recreate
```

---

## Production Deployment

For production deployment:

1. **Use proper SSL certificates** (Let's Encrypt, commercial CA)
2. **Change all secrets** in `.env`
3. **Set secure database password**
4. **Configure CORS_ORIGIN** to your domain
5. **Use environment-specific config**
6. **Set up backup strategy** for database
7. **Use managed PostgreSQL** (AWS RDS, Google Cloud SQL, etc.)
8. **Configure CDN** for static assets
9. **Set up monitoring** and logging
10. **Use orchestration** (Kubernetes, AWS ECS, etc.) for scale

### Production Environment Variables

```bash
# Production .env example
NODE_ENV=production
POSTGRES_PASSWORD=<very-secure-password>
JWT_ACCESS_SECRET=<64-char-random-string>
JWT_REFRESH_SECRET=<64-char-random-string>
CORS_ORIGIN=https://yourdomain.com
VITE_GOOGLE_MAPS_API_KEY=<your-api-key>
```

---

## Performance Tips

### 1. **Build Optimization**
```bash
# Use BuildKit for faster builds
DOCKER_BUILDKIT=1 docker-compose build
```

### 2. **Volume Mounts for Development**
To avoid rebuilding for every code change, you can mount code as volumes:

```yaml
# Add to docker-compose.yml for development
services:
  api:
    volumes:
      - ./apps/api/src:/app/src
```

### 3. **Resource Limits**
Add resource limits in `docker-compose.yml`:

```yaml
services:
  api:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
```

---

## Support

### Logs
Always check logs first when troubleshooting:
```bash
docker-compose logs -f --tail=100
```

### Health Checks
Check service health:
```bash
docker-compose ps
# Look for "healthy" status
```

### Restart Fresh
```bash
# Complete clean restart
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
docker-compose exec api npm run db:migrate
docker-compose exec api npm run db:seed
```

---

## Next Steps

1. ✅ Run `docker-compose up -d`
2. ✅ Access https://localhost
3. ✅ Test on your phone via https://YOUR_IP
4. ✅ Try AR Measure feature
5. ✅ Build your indoor maps!

Happy mapping with CampusAR! 🗺️✨
