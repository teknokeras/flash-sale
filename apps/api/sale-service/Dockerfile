# ── Development stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS development

RUN npm install -g pnpm

WORKDIR /app

# Copy workspace manifests first (better layer caching)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/db/package.json ./packages/db/
COPY apps/api/sale-service/package.json ./apps/api/sale-service/

RUN pnpm install

# Copy source
COPY packages/db ./packages/db
COPY apps/api/sale-service ./apps/api/sale-service
COPY tsconfig.base.json ./

WORKDIR /app/apps/api/sale-service

EXPOSE 3001

CMD ["pnpm", "dev"]

# ── Production stage ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN npm install -g pnpm
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/db/package.json ./packages/db/
COPY apps/api/sale-service/package.json ./apps/api/sale-service/

RUN pnpm install --frozen-lockfile

COPY packages/db ./packages/db
COPY apps/api/sale-service ./apps/api/sale-service
COPY tsconfig.base.json ./

RUN pnpm --filter @flash-sale/db build
RUN pnpm --filter @flash-sale/sale-service build

FROM node:20-alpine AS production

RUN npm install -g pnpm
WORKDIR /app

COPY package.json pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/
COPY apps/api/sale-service/package.json ./apps/api/sale-service/

RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/apps/api/sale-service/dist ./apps/api/sale-service/dist

WORKDIR /app/apps/api/sale-service

EXPOSE 3001

USER node

CMD ["node", "dist/index.js"]