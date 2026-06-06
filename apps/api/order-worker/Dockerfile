# ── Development stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS development

RUN npm install -g pnpm

WORKDIR /app

# Copy workspace manifests first (better layer caching)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/db/package.json ./packages/db/
COPY apps/api/order-service/package.json ./apps/api/order-service/

RUN pnpm install

# Copy source
COPY packages/db ./packages/db
COPY apps/api/order-service ./apps/api/order-service
COPY tsconfig.base.json ./

WORKDIR /app/apps/api/order-service

EXPOSE 3001

CMD ["pnpm", "dev"]

# ── Production stage ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN npm install -g pnpm
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/db/package.json ./packages/db/
COPY apps/api/order-service/package.json ./apps/api/order-service/

RUN pnpm install --frozen-lockfile

COPY packages/db ./packages/db
COPY apps/api/order-service ./apps/api/order-service
COPY tsconfig.base.json ./

RUN pnpm --filter @flash-sale/db build
RUN pnpm --filter @flash-sale/order-service build

FROM node:20-alpine AS production

RUN npm install -g pnpm
WORKDIR /app

COPY package.json pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/
COPY apps/api/order-service/package.json ./apps/api/order-service/

RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/apps/api/order-service/dist ./apps/api/order-service/dist

WORKDIR /app/apps/api/order-service

EXPOSE 3001

USER node

CMD ["node", "dist/index.js"]