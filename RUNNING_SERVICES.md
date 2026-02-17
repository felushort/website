# 🎉 ServerForge is Running!

## Current Status

All services are **LIVE** and operational on localhost:

| Service | Status | URL |
|---------|--------|-----|
| 🌐 Web UI | ✅ Running | http://localhost:3000 |
| 🔌 API | ✅ Running | http://localhost:4000 |
| 🐘 PostgreSQL | ✅ Running | localhost:5432 |
| 🔴 Redis | ✅ Running | localhost:6379 |

## Quick Access

### Main Application
- **Dashboard**: http://localhost:3000/dashboard
- **Revenue**: http://localhost:3000/revenue  
- **Staff**: http://localhost:3000/staff
- **Players**: http://localhost:3000/players
- **Billing**: http://localhost:3000/billing
- **Admin**: http://localhost:3000/admin

### API Endpoints
- **Health Check**: http://localhost:4000/api/v1/health
- **API Base**: http://localhost:4000/api/v1

## Test Credentials (from seeded data)

The database has been seeded with sample data. You can explore:
- Sample workspaces
- Revenue entries (2 entries with totals)
- Staff applications (12 pending)
- Player records with reputation scores

## Managing Services

### View Logs
```bash
# API logs (in the terminal running pnpm dev)
# Or check Docker logs:
docker compose logs -f postgres redis
```

### Stop Services
```bash
# Stop dev servers: Ctrl+C in the terminal running pnpm dev
# Stop Docker containers:
docker compose down
```

### Restart Services
```bash
# Restart dev servers:
pnpm dev

# Restart Docker containers:
docker compose restart postgres redis
```

## Monitoring

Check service health:
```bash
# API Health
curl http://localhost:4000/api/v1/health

# Web UI (should return 307 redirect to dashboard)
curl -I http://localhost:3000

# Docker services
docker ps
```

## Next Steps

1. ✅ **Explore the Dashboard** - View metrics and revenue charts
2. ✅ **Browse Revenue** - See seeded revenue entries
3. ✅ **Check Staff Applications** - Review pending applications
4. ✅ **Manage Players** - View player profiles and reputation
5. 📖 **Read LOCALHOST_SETUP.md** - For detailed setup instructions

---

**Tip**: Keep the terminal running `pnpm dev` open to see live logs from both the API and Web UI. Both services support hot reload, so your changes will be reflected automatically!
