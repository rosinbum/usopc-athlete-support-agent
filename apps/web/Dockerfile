# ---------- Stage 1: Install dependencies ----------
FROM node:20-slim AS deps
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy workspace config + lockfile + package.jsons
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/shared/package.json packages/shared/
COPY packages/ingestion/package.json packages/ingestion/

RUN pnpm install --frozen-lockfile

# ---------- Stage 2: Build ----------
FROM node:20-slim AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

COPY . .

# Build shared packages first, then web
RUN pnpm --filter @usopc/shared build && \
    pnpm --filter @usopc/core build && \
    pnpm --filter @usopc/web build

# ---------- Stage 3: Production ----------
FROM node:20-slim AS production
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

ENV NODE_ENV=production
ENV PORT=8080

# Copy built output
COPY --from=build /app/apps/web/build ./apps/web/build
COPY --from=build /app/apps/web/server ./apps/web/server
COPY --from=build /app/apps/web/package.json ./apps/web/
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/core/package.json ./packages/core/
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/data ./data

# Copy workspace config for pnpm
COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /app/pnpm-lock.yaml ./
COPY --from=build /app/package.json ./

# Install production deps only
RUN pnpm install --frozen-lockfile --prod

EXPOSE 8080

CMD ["node", "apps/web/server/app.js"]
