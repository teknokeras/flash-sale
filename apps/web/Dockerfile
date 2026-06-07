# 1. Use the actively maintained Node 22 LTS Alpine image
FROM node:22-alpine AS development

# 2. Fix Alpine OS-level vulnerabilities on build
RUN apk update && apk upgrade --no-cache

# 3. Set up PNPM environment and install it securely
# FIX: Move PNPM home to the node user's home directory
ENV PNPM_HOME="/home/node/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# 4. Set correct ownership for the application directory
RUN chown -R node:node /app

# 5. Switch to the non-root 'node' user for security
USER node

# FIX: Tell pnpm to use a cache/store directory inside the node user's home
RUN pnpm config set store-dir /home/node/.local/share/pnpm/store

# 6. Copy lock files and workspace configurations
COPY --chown=node:node package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
# CRITICAL FIX: You must mimic the exact folder structure for monorepo installs
COPY --chown=node:node apps/web/package.json ./apps/web/

# 7. Install dependencies 
RUN pnpm install --frozen-lockfile --shamefully-hoist

# 8. Copy application code with proper ownership
COPY --chown=node:node apps/web ./apps/web

WORKDIR /app/apps/web
EXPOSE 5173

CMD ["pnpm", "dev", "--host"]