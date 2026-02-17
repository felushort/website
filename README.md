# ServerForge

Production-ready multi-tenant SaaS platform foundation for Minecraft server owners.

## Stack
- `apps/web`: Next.js 14, TypeScript, Tailwind, dark-mode dashboard UI.
- `apps/api`: Express, TypeScript, Prisma, PostgreSQL, Redis, JWT, Stripe.
- `packages/shared`: shared Zod schemas and types.

## Quick start
1. Copy `.env.example` values into real env files.
2. Start infra: `docker compose up -d postgres redis`.
3. Install deps: `pnpm install`.
4. Push schema: `pnpm db:push`.
5. Seed data: `pnpm db:seed`.
6. Run apps: `pnpm dev`.

## Services
- Web: http://localhost:3000
- API: http://localhost:4000

## Production notes
- Configure Stripe secrets and webhook endpoint.
- Use managed PostgreSQL + Redis in production.
- Rotate JWT secrets and enforce HTTPS only cookies.
