# ── Development stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS development

RUN npm install -g pnpm
WORKDIR /app

# 1. Copy core workspace configs AND package manifests first
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/db/package.json ./packages/db/
COPY apps/api/sale-service/package.json ./apps/api/sale-service/

# 2. Fetch all dependencies cleanly with complete graph awareness
RUN pnpm fetch

# 3. Complete the offline extraction
RUN pnpm install --offline --shamefully-hoist

# 4. Copy source directories
COPY packages/db ./packages/db
COPY apps/api/sale-service ./apps/api/sale-service
COPY tsconfig.base.json ./

RUN pnpm --filter @flash-sale/db build

WORKDIR /app/apps/api/sale-service
EXPOSE 3001
CMD ["pnpm", "dev"]

# ── Production stage ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN npm install -g pnpm
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch

COPY packages/db/package.json ./packages/db/
COPY apps/api/sale-service/package.json ./apps/api/sale-service/

RUN pnpm install --offline --frozen-lockfile

COPY packages/db ./packages/db
COPY apps/api/sale-service ./apps/api/sale-service
COPY tsconfig.base.json ./

RUN pnpm --filter @flash-sale/db build
RUN pnpm --filter @flash-sale/sale-service build

FROM node:20-alpine AS production

RUN npm install -g pnpm
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch

COPY packages/db/package.json ./packages/db/
COPY apps/api/sale-service/package.json ./apps/api/sale-service/

RUN pnpm install --offline --prod --frozen-lockfile

COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/apps/api/sale-service/dist ./apps/api/sale-service/dist

WORKDIR /app/apps/api/sale-service

EXPOSE 3001

USER node

CMD ["node", "dist/index.js"]