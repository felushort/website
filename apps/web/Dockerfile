FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --filter @serverforge/web... --filter @serverforge/shared...

COPY apps/web apps/web
COPY packages/shared packages/shared

WORKDIR /app/apps/web
RUN pnpm build

EXPOSE 3000
CMD ["pnpm", "start"]
