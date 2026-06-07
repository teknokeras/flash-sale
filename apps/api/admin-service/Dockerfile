# ── Development stage ─────────────────────────────────────────────────────────
FROM node:22-alpine AS development

RUN npm install -g pnpm

WORKDIR /app

# 1. Copy the configuration files (Crucial: Include .npmrc* here!)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./

# 2. Fetch dependencies (It will now read 'lockfile-policy=false' from your .npmrc)
RUN pnpm fetch

# 3. Copy workspace targets
COPY packages/db/package.json ./packages/db/
COPY apps/api/admin-service/package.json ./apps/api/admin-service/

# 4. Install offline 
RUN pnpm install --offline

# Copy source code and build...
COPY packages/db ./packages/db
COPY apps/api/admin-service ./apps/api/admin-service
COPY tsconfig.base.json ./
RUN pnpm --filter @flash-sale/db build

WORKDIR /app/apps/api/admin-service
EXPOSE 3003
CMD ["pnpm", "dev"]

# ── Production stage ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN npm install -g pnpm
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/db/package.json ./packages/db/
COPY apps/api/admin-service/package.json ./apps/api/admin-service/

RUN pnpm install --frozen-lockfile

COPY packages/db ./packages/db
COPY apps/api/admin-service ./apps/api/admin-service
COPY tsconfig.base.json ./

RUN pnpm --filter @flash-sale/db build
RUN pnpm --filter @flash-sale/admin-service build

FROM node:22-alpine AS production

RUN npm install -g pnpm
WORKDIR /app

COPY package.json pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/
COPY apps/api/admin-service/package.json ./apps/api/admin-service/

RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/apps/api/admin-service/dist ./apps/api/admin-service/dist

WORKDIR /app/apps/api/admin-service

EXPOSE 3003

USER node

CMD ["node", "dist/index.js"]