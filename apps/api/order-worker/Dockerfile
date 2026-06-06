# ── Development stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS development

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/db/package.json ./packages/db/
COPY apps/api/order-worker/package.json ./apps/api/order-worker/

RUN pnpm install --shamefully-hoist

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

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/db/package.json ./packages/db/
COPY apps/api/order-worker/package.json ./apps/api/order-worker/

RUN pnpm install --frozen-lockfile

COPY packages/db ./packages/db
COPY apps/api/order-worker ./apps/api/order-worker
COPY tsconfig.base.json ./

RUN pnpm --filter @flash-sale/db build
RUN pnpm --filter @flash-sale/order-worker build

FROM node:20-alpine AS production

RUN npm install -g pnpm
WORKDIR /app

COPY package.json pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/
COPY apps/api/order-worker/package.json ./apps/api/order-worker/

RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/apps/api/order-worker/dist ./apps/api/order-worker/dist

WORKDIR /app/apps/api/order-worker

USER node

CMD ["node", "dist/index.js"]