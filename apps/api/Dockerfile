FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --filter @serverforge/api... --filter @serverforge/shared...

COPY apps/api apps/api
COPY packages/shared packages/shared

WORKDIR /app/apps/api
RUN pnpm prisma generate
RUN pnpm build

EXPOSE 4000
CMD ["pnpm", "start"]
