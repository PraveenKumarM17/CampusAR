# CampusAR Docker Quick Reference

## 🚀 Super Quick Start (Windows)

### One-Command Start:
```powershell
.\docker-start.ps1
```

This script will:
- ✅ Check Docker installation
- ✅ Setup environment variables
- ✅ Build containers
- ✅ Start all services
- ✅ Run database migrations
- ✅ Show access URLs

### Stop:
```powershell
.\docker-stop.ps1
```

---

## 📱 Access Points

### From Your Computer:
- **Web App**: https://localhost
- **API**: http://localhost:4000
- **API Docs**: http://localhost:4000/api/docs
- **Database**: localhost:5433

### From Your Phone (Same WiFi):
- **Web App**: https://YOUR_IP_ADDRESS
  - Get IP: Run `ipconfig` in PowerShell
  - Example: `https://192.168.1.100`

---

## 🎯 What's Running

| Service | Container Name | Port | Description |
|---------|---------------|------|-------------|
| **Web** | campusar-web | 80, 443 | React frontend with Nginx |
| **API** | campusar-api | 4000 | Node.js backend |
| **Database** | campusar-db | 5433 | PostgreSQL 16 |

---

## 📝 Common Commands

```powershell
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs (all services)
docker-compose logs -f

# View logs (specific service)
docker-compose logs -f api
docker-compose logs -f web
docker-compose logs -f db

# Restart a service
docker-compose restart api

# Rebuild after code changes
docker-compose build
docker-compose up -d

# Check service status
docker-compose ps

# Run database migrations
docker-compose exec api npm run db:migrate

# Seed database
docker-compose exec api npm run db:seed

# Access API container shell
docker-compose exec api sh

# Access database CLI
docker-compose exec db psql -U campusar -d campusar
```

---

## 🔧 Configuration

Environment variables are in `.env` file (created from `.env.docker`).

**Important settings:**
- `POSTGRES_PASSWORD` - Database password
- `JWT_ACCESS_SECRET` - Auth token secret
- `JWT_REFRESH_SECRET` - Refresh token secret
- `CORS_ORIGIN` - Allowed frontend origin
- `VITE_GOOGLE_MAPS_API_KEY` - Optional Google Maps key

---

## 🐛 Troubleshooting

### Docker not running?
```powershell
# Start Docker Desktop, then verify:
docker --version
docker ps
```

### Port already in use?
Change ports in `docker-compose.yml`:
```yaml
ports:
  - "8080:80"    # Change 80 to 8080
  - "8443:443"   # Change 443 to 8443
```

### Database issues?
```powershell
# Check database logs
docker-compose logs -f db

# Restart database
docker-compose restart db

# Reset database (⚠️ deletes all data)
docker-compose down -v
docker-compose up -d
docker-compose exec api npm run db:migrate
```

### Certificate warnings?
This is normal for self-signed certificates in development. Click "Advanced" → "Proceed" in your browser.

### Can't access from phone?
- ✅ Same WiFi network
- ✅ Use `https://` (not `http://`)
- ✅ Check firewall isn't blocking ports
- ✅ Verify IP address with `ipconfig`

---

## 📚 Documentation

- **Full Setup Guide**: `DOCKER_SETUP.md`
- **AR on Mobile**: `MOBILE_AR_SETUP.md`
- **Project README**: `README.md`

---

## 🎉 Next Steps

1. Access https://localhost
2. Create an admin account
3. Build your first indoor map
4. Test AR Measure on your phone!

For detailed instructions, see `DOCKER_SETUP.md`.
