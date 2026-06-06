# ── Development stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS development

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/db/package.json ./packages/db/
COPY apps/api/purchase-service/package.json ./apps/api/purchase-service/

RUN pnpm install --shamefully-hoist

COPY packages/db ./packages/db
COPY apps/api/purchase-service ./apps/api/purchase-service
COPY tsconfig.base.json ./

RUN pnpm --filter @flash-sale/db build

WORKDIR /app/apps/api/purchase-service

EXPOSE 3002

CMD ["pnpm", "dev"]

# ── Production stage ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN npm install -g pnpm
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/db/package.json ./packages/db/
COPY apps/api/purchase-service/package.json ./apps/api/purchase-service/

RUN pnpm install --frozen-lockfile

COPY packages/db ./packages/db
COPY apps/api/purchase-service ./apps/api/purchase-service
COPY tsconfig.base.json ./

RUN pnpm --filter @flash-sale/db build
RUN pnpm --filter @flash-sale/purchase-service build

FROM node:20-alpine AS production

RUN npm install -g pnpm
WORKDIR /app

COPY package.json pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/
COPY apps/api/purchase-service/package.json ./apps/api/purchase-service/

RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/apps/api/purchase-service/dist ./apps/api/purchase-service/dist

WORKDIR /app/apps/api/purchase-service

EXPOSE 3002

USER node

CMD ["node", "dist/index.js"]