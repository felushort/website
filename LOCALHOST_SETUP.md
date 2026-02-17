# ServerForge - Localhost Setup Guide

This guide will help you run the ServerForge application on your local machine.

## Prerequisites

- Node.js 18+ installed
- Docker and Docker Compose installed
- pnpm package manager (`npm install -g pnpm@9.12.3`)

## Quick Start

Follow these steps to get ServerForge running on localhost:

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Start Infrastructure (PostgreSQL & Redis)

```bash
docker compose up -d postgres redis
```

This will start:
- PostgreSQL on port 5432
- Redis on port 6379

### 3. Configure Environment Variables

Create environment files from the example:

```bash
cp .env.example apps/api/.env
cp .env.example apps/web/.env
```

**Important:** The API requires JWT secrets to be at least 32 characters. The default secrets in `.env.example` meet this requirement.

### 4. Setup Database

Generate Prisma client and push the schema:

```bash
pnpm --filter @serverforge/api prisma generate
pnpm db:push
```

### 5. Seed Database (Optional)

Populate the database with sample data:

```bash
pnpm db:seed
```

This creates:
- Sample workspaces
- Revenue entries
- Staff applications
- Player records

### 6. Start Development Servers

```bash
pnpm dev
```

This will start both services in parallel:
- **Web UI**: http://localhost:3000
- **API**: http://localhost:4000

## Verify Installation

### Check API Health

```bash
curl http://localhost:4000/api/v1/health
```

Expected response:
```json
{"status":"ok","service":"serverforge-api","timestamp":"..."}
```

### Check Web UI

Open your browser and navigate to:
- http://localhost:3000

You should see the ServerForge dashboard with:
- MRR metrics
- Revenue chart
- Navigation sidebar

## Services Overview

| Service | Port | URL |
|---------|------|-----|
| Web UI | 3000 | http://localhost:3000 |
| API | 4000 | http://localhost:4000 |
| PostgreSQL | 5432 | localhost:5432 |
| Redis | 6379 | localhost:6379 |

## Available Pages

- **Dashboard** - http://localhost:3000/dashboard (default)
- **Revenue** - http://localhost:3000/revenue
- **Staff** - http://localhost:3000/staff
- **Players** - http://localhost:3000/players
- **Billing** - http://localhost:3000/billing
- **Platform Admin** - http://localhost:3000/admin

## Common Commands

```bash
# Start all services
pnpm dev

# Build for production
pnpm build

# Run linting
pnpm lint

# Run type checking
pnpm typecheck

# Database commands
pnpm db:push        # Push schema changes
pnpm db:migrate     # Create and apply migrations
pnpm db:seed        # Seed database with sample data

# Docker commands
docker compose up -d postgres redis  # Start infrastructure
docker compose down                   # Stop all services
docker compose logs -f               # View logs
```

## Troubleshooting

### API won't start - JWT secret error

If you see an error about JWT secrets, ensure they are at least 32 characters long in `apps/api/.env`:

```env
JWT_ACCESS_SECRET=dev_jwt_access_secret_must_be_at_least_32_chars_long_12345
JWT_REFRESH_SECRET=dev_jwt_refresh_secret_must_be_at_least_32_chars_long_12345
```

### Database connection error

Ensure PostgreSQL is running:

```bash
docker compose ps
```

If not running, start it:

```bash
docker compose up -d postgres
```

### Port already in use

If ports 3000 or 4000 are already in use, you can change them in the environment files:

- API port: `apps/api/.env` → `API_PORT=4000`
- Web port: modify the `dev` script in `apps/web/package.json`

### Cannot connect to Redis

Ensure Redis is running:

```bash
docker compose up -d redis
```

## Development Tips

1. **Hot Reload**: Both the API and Web UI support hot reload during development
2. **Database GUI**: Use tools like Prisma Studio to view database:
   ```bash
   pnpm --filter @serverforge/api prisma studio
   ```
3. **API Documentation**: The API follows REST conventions with endpoints at `/api/v1/*`
4. **Dark Mode**: The UI includes dark mode by default

## Next Steps

- Explore the codebase in `apps/web` (Next.js frontend) and `apps/api` (Express backend)
- Review the database schema in `apps/api/prisma/schema.prisma`
- Check out shared types in `packages/shared`
- Read the main README.md for production deployment notes

## Support

For issues or questions, refer to the main README.md or repository documentation.
