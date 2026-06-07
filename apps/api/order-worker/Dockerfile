# ── Development stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS development

RUN npm install -g pnpm
WORKDIR /app

# 1. Copy core workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# 2. Fetch dependencies to virtual store
RUN pnpm fetch

# 3. Copy project package definitions
COPY packages/db/package.json ./packages/db/
COPY apps/api/order-worker/package.json ./apps/api/order-worker/

# 4. Install offline (reads configuration seamlessly from workspace file)
RUN pnpm install --offline --shamefully-hoist

COPY packages/db ./packages/db
COPY apps/api/order-worker ./apps/api/order-worker
COPY tsconfig.base.json ./

RUN pnpm --filter @flash-sale/db build

WORKDIR /app/apps/api/order-worker
CMD ["pnpm", "dev"]

# ── Production stage ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN npm install -g pnpm
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch

COPY packages/db/package.json ./packages/db/
COPY apps/api/order-worker/package.json ./apps/api/order-worker/

RUN pnpm install --offline --frozen-lockfile

COPY packages/db ./packages/db
COPY apps/api/order-worker ./apps/api/order-worker
COPY tsconfig.base.json ./

RUN pnpm --filter @flash-sale/db build
RUN pnpm --filter @flash-sale/order-worker build

FROM node:20-alpine AS production

RUN npm install -g pnpm
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch

COPY packages/db/package.json ./packages/db/
COPY apps/api/order-worker/package.json ./apps/api/order-worker/

RUN pnpm install --offline --prod --frozen-lockfile

COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/apps/api/order-worker/dist ./apps/api/order-worker/dist

WORKDIR /app/apps/api/order-worker
USER node
CMD ["node", "dist/index.js"]